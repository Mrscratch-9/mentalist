import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface TmdbEpisode {
  season: number;
  episode: number;
  name: string;
  overview: string;
  airDate: string | null;
}

export interface TmdbClientOptions {
  apiKey: string | undefined;
  showId: number;
  fetch?: typeof fetch;
  /** Default `data/.cache/tmdb` (relative to cwd). */
  cacheDir?: string;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
}

const BASE = "https://api.themoviedb.org/3";
export const MIN_SEASON = 1;
export const MAX_SEASON = 7;
const INVALID_KEY = "TMDB_API_KEY is missing or invalid";

interface RawEpisode {
  season_number?: number;
  episode_number?: number;
  name?: string;
  overview?: string;
  air_date?: string | null;
}

function isEpisodeList(v: unknown): v is TmdbEpisode[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.every((e) => {
      const o = e as Partial<TmdbEpisode> | null;
      return (
        typeof o === "object" && o !== null && Number.isInteger(o.season) && Number.isInteger(o.episode) &&
        typeof o.name === "string" && typeof o.overview === "string" &&
        (o.airDate === null || typeof o.airDate === "string")
      );
    })
  );
}

export class TmdbClient {
  private readonly fetchFn: typeof fetch;
  private readonly cacheDir: string;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;
  private readonly credential: string | undefined;
  private readonly showId: number;
  private mode: "bearer" | "query" = "bearer";

  constructor(o: TmdbClientOptions) {
    this.fetchFn = o.fetch ?? globalThis.fetch;
    this.cacheDir = o.cacheDir ?? join("data", ".cache", "tmdb");
    this.sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.maxRetries = o.maxRetries ?? 5;
    this.credential = o.apiKey;
    this.showId = o.showId;
  }

  /** v3 keys are short hex strings; v4 read tokens are long JWTs. */
  private looksV3(): boolean {
    return this.credential !== undefined && /^[0-9a-f]{32}$/i.test(this.credential);
  }

  async getSeason(season: number, language: string): Promise<TmdbEpisode[]> {
    if (!Number.isInteger(season) || season < MIN_SEASON || season > MAX_SEASON) {
      throw new Error(`season must be an integer between ${MIN_SEASON} and ${MAX_SEASON}`);
    }
    const cacheFile = join(
      this.cacheDir,
      `${this.showId}-s${season}-${language.replace(/[^A-Za-z0-9-]/g, "_")}.json`,
    );
    try {
      const cached: unknown = JSON.parse(readFileSync(cacheFile, "utf8"));
      if (isEpisodeList(cached)) return cached;
    } catch {
      // cache miss or unreadable cache
    }
    if (!this.credential) throw new Error(INVALID_KEY);
    const body = await this.request(
      `${BASE}/tv/${this.showId}/season/${season}?language=${encodeURIComponent(language)}`,
    );
    const raw = (body as { episodes?: unknown }).episodes;
    if (!Array.isArray(raw) || raw.length === 0) throw new Error(`TMDB season ${season} returned no episodes`);
    const eps = (raw as RawEpisode[]).map(
      (e): TmdbEpisode => ({
        season: e.season_number ?? season,
        episode: e.episode_number ?? 0,
        name: e.name ?? "",
        overview: e.overview ?? "",
        airDate: e.air_date ? e.air_date : null,
      }),
    );
    mkdirSync(this.cacheDir, { recursive: true });
    writeFileSync(cacheFile, JSON.stringify(eps));
    return eps;
  }

  /** Seasons 1..7 sequentially (season 0 / specials skipped). */
  async getAllSeasons(language: string): Promise<TmdbEpisode[]> {
    const out: TmdbEpisode[] = [];
    for (let s = MIN_SEASON; s <= MAX_SEASON; s++) out.push(...(await this.getSeason(s, language)));
    return out;
  }

  private async send(url: string): Promise<Response> {
    const secret = this.credential as string;
    const headers: Record<string, string> = { Accept: "application/json" };
    let target = url;
    if (this.mode === "bearer") headers.Authorization = `Bearer ${secret}`;
    else target = `${url}&api_key=${encodeURIComponent(secret)}`;
    try {
      return await this.fetchFn(target, { headers });
    } catch {
      // network errors may embed the URL; never surface it
      throw new Error("TMDB request failed (network error)");
    }
  }

  private async request(url: string): Promise<unknown> {
    let fellBack = false;
    for (let attempt = 0; ; attempt++) {
      const res = await this.send(url);
      if (res.status === 401) {
        if (this.mode === "bearer" && !fellBack && this.looksV3()) {
          this.mode = "query";
          fellBack = true;
          continue;
        }
        throw new Error(INVALID_KEY);
      }
      if (res.status === 429) {
        if (attempt >= this.maxRetries) throw new Error("TMDB rate limit (429): retries exhausted");
        const header = res.headers.get("Retry-After");
        const ra = header !== null && header.trim() !== "" ? Number(header) : NaN;
        await this.sleep(Number.isFinite(ra) && ra >= 0 ? ra * 1000 : 1000 * 2 ** attempt);
        continue;
      }
      if (!res.ok) throw new Error(`TMDB request failed (HTTP ${res.status})`);
      return await res.json();
    }
  }
}
