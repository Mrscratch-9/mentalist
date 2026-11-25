import type { FandomCache } from "./cache.ts";

export const USER_AGENT = "mentalist-archive-importer/0.1 (personal, non-commercial)";
export const DEFAULT_BASE_URL = "https://thementalist.fandom.com/api.php";

export interface FandomPage {
  title: string;
  pageid: number;
  revid: number;
  wikitext: string;
  /** Category names without the `Category:` prefix. */
  categories: string[];
}

export interface FandomClientOptions {
  baseUrl?: string;
  fetch?: typeof fetch;
  cache?: FandomCache;
  /** Retries after the first attempt on maxlag/429/5xx/network errors (default 5). */
  maxRetries?: number;
  /** Base backoff in ms, doubled per retry (default 1000). */
  backoffMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

interface ApiPage {
  pageid?: number;
  title: string;
  missing?: boolean;
  revisions?: Array<{ revid?: number; slots?: { main?: { content?: string } } }>;
  categories?: Array<{ title: string }>;
}
interface ApiResponse {
  error?: { code?: string; info?: string };
  continue?: Record<string, string>;
  query?: {
    pages?: ApiPage[];
    categorymembers?: Array<{ title: string }>;
    redirects?: Array<{ from: string; to: string }>;
  };
}

class RetryableError extends Error {
  constructor(message: string, readonly retryAfterMs?: number) {
    super(message);
  }
}

export class FandomClient {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly cache: FandomCache | undefined;
  private readonly maxRetries: number;
  private readonly backoffMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: FandomClientOptions = {}) {
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchFn = opts.fetch ?? fetch;
    this.cache = opts.cache;
    this.maxRetries = opts.maxRetries ?? 5;
    this.backoffMs = opts.backoffMs ?? 1000;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** One API call (sequential; callers await each). Honors the cache mode and retries transient failures. */
  private async request(params: Record<string, string>): Promise<ApiResponse> {
    const full: Record<string, string> = { action: "query", format: "json", formatversion: "2", maxlag: "5", ...params };
    const cache = this.cache;
    if (cache && (cache.offline || cache.preferCache)) {
      const hit = (await cache.getResponse(full)) as ApiResponse | null;
      if (hit) return hit;
      if (cache.offline) throw new Error(`offline mode: no cached response for ${JSON.stringify(params)}`);
    }
    const body = await this.fetchWithRetry(full);
    if (cache) await cache.putResponse(full, body);
    return body;
  }

  private async fetchWithRetry(params: Record<string, string>): Promise<ApiResponse> {
    const url = `${this.baseUrl}?${new URLSearchParams(params).toString()}`;
    let lastError: Error = new Error("request failed");
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const hinted = lastError instanceof RetryableError ? lastError.retryAfterMs : undefined;
        await this.sleep(hinted ?? this.backoffMs * 2 ** (attempt - 1));
      }
      try {
        const res = await this.fetchFn(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
        if (res.status === 429 || res.status >= 500) {
          const ra = Number(res.headers.get("retry-after"));
          throw new RetryableError(`HTTP ${res.status}`, Number.isFinite(ra) && ra > 0 ? ra * 1000 : undefined);
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as ApiResponse;
        if (body.error) {
          if (body.error.code === "maxlag") throw new RetryableError("maxlag");
          throw new Error(`api error ${body.error.code ?? "unknown"}: ${body.error.info ?? ""}`);
        }
        return body;
      } catch (e) {
        if (e instanceof RetryableError) lastError = e;
        else if (e instanceof TypeError || (e instanceof Error && e.message === "network")) lastError = new RetryableError(e.message);
        else if (e instanceof Error && /^(HTTP|api error)/.test(e.message)) throw e;
        else lastError = new RetryableError(e instanceof Error ? e.message : String(e));
      }
    }
    throw new Error(`gave up after ${this.maxRetries + 1} attempts: ${lastError.message}`);
  }

  /** Runs a query following `continue` until exhausted, handing each response to `onPage`. */
  private async paged(params: Record<string, string>, onResponse: (r: ApiResponse) => void): Promise<void> {
    let cont: Record<string, string> = {};
    for (;;) {
      const res = await this.request({ ...params, ...cont });
      onResponse(res);
      if (!res.continue) return;
      cont = res.continue;
    }
  }

  async listCategoryMembers(category: string, opts: { namespace?: number } = {}): Promise<string[]> {
    const titles: string[] = [];
    await this.paged(
      {
        list: "categorymembers",
        cmtitle: `Category:${category.replace(/^Category:/i, "")}`,
        cmlimit: "500",
        ...(opts.namespace !== undefined ? { cmnamespace: String(opts.namespace) } : {}),
      },
      (r) => {
        for (const m of r.query?.categorymembers ?? []) titles.push(m.title);
      },
    );
    return titles;
  }

  private collect(into: Map<string, FandomPage>, r: ApiResponse): void {
    for (const p of r.query?.pages ?? []) {
      if (p.missing) continue;
      const cur = into.get(p.title) ?? { title: p.title, pageid: p.pageid ?? 0, revid: 0, wikitext: "", categories: [] };
      const rev = p.revisions?.[0];
      if (rev) {
        cur.revid = rev.revid ?? cur.revid;
        cur.wikitext = rev.slots?.main?.content ?? cur.wikitext;
      }
      if (p.pageid) cur.pageid = p.pageid;
      for (const c of p.categories ?? []) {
        const name = c.title.replace(/^Category:/i, "");
        if (!cur.categories.includes(name)) cur.categories.push(name);
      }
      into.set(p.title, cur);
    }
  }

  private async store(pages: FandomPage[]): Promise<void> {
    if (this.cache && !this.cache.offline) for (const p of pages) await this.cache.putPage(p);
  }

  private static readonly PAGE_PROPS = {
    prop: "revisions|categories",
    rvprop: "ids|content",
    rvslots: "main",
    cllimit: "max",
    redirects: "1",
  };

  /** Wikitext + revid + categories for titles (redirects followed), in batches (default 20). */
  async getPages(titles: string[], opts: { batchSize?: number } = {}): Promise<FandomPage[]> {
    if (this.cache?.offline) {
      const out: FandomPage[] = [];
      for (const t of titles) {
        const p = await this.cache.getPage(t);
        if (!p) throw new Error(`offline mode: page not cached: ${t}`);
        out.push(p);
      }
      return out;
    }
    const size = Math.min(Math.max(opts.batchSize ?? 20, 1), 50);
    const out: FandomPage[] = [];
    for (let i = 0; i < titles.length; i += size) {
      const found = new Map<string, FandomPage>();
      await this.paged({ ...FandomClient.PAGE_PROPS, titles: titles.slice(i, i + size).join("|") }, (r) => this.collect(found, r));
      const pages = [...found.values()];
      await this.store(pages);
      out.push(...pages);
    }
    return out;
  }

  /** All pages of a category via generator=categorymembers (batches of 20 by default). */
  async getCategoryPages(category: string, opts: { batchSize?: number; namespace?: number } = {}): Promise<FandomPage[]> {
    if (this.cache?.offline) {
      return this.getPages(await this.listCategoryMembers(category, opts), opts);
    }
    const found = new Map<string, FandomPage>();
    await this.paged(
      {
        ...FandomClient.PAGE_PROPS,
        generator: "categorymembers",
        gcmtitle: `Category:${category.replace(/^Category:/i, "")}`,
        gcmlimit: String(Math.min(Math.max(opts.batchSize ?? 20, 1), 50)),
        ...(opts.namespace !== undefined ? { gcmnamespace: String(opts.namespace) } : {}),
      },
      (r) => this.collect(found, r),
    );
    const pages = [...found.values()];
    await this.store(pages);
    return pages;
  }

  /** Map from each requested title to its redirect target (itself when not a redirect). */
  async resolveRedirects(titles: string[], opts: { batchSize?: number } = {}): Promise<Map<string, string>> {
    const size = Math.min(Math.max(opts.batchSize ?? 50, 1), 50);
    const map = new Map<string, string>(titles.map((t) => [t, t]));
    for (let i = 0; i < titles.length; i += size) {
      await this.paged({ titles: titles.slice(i, i + size).join("|"), redirects: "1" }, (r) => {
        for (const rd of r.query?.redirects ?? []) map.set(rd.from, rd.to);
      });
    }
    return map;
  }
}
