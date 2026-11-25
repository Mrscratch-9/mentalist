import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FandomClient } from "../../src/fandom/client.ts";
import { FandomCache } from "../../src/fandom/cache.ts";

const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "fandom-"));
  dirs.push(d);
  return d;
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

function fake(responses: Array<Response | Error>) {
  const calls: URL[] = [];
  const headers: Headers[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push(new URL(String(input)));
    headers.push(new Headers(init?.headers));
    const r = responses.shift();
    if (!r) throw new Error("no more responses");
    if (r instanceof Error) throw r;
    return r;
  }) as typeof fetch;
  return { fn, calls, headers };
}
const opts = (f: typeof fetch, extra = {}) => ({
  baseUrl: "https://x.test/api.php",
  fetch: f,
  sleep: async () => {},
  ...extra,
});
const pageBody = (title: string, revid: number, cats: string[] = []) => ({
  pageid: revid,
  title,
  revisions: [{ revid, slots: { main: { content: `wt ${title}` } } }],
  categories: cats.map((c) => ({ title: `Category:${c}` })),
});

describe("FandomClient", () => {
  it("lists category members following continuation, with UA, maxlag and formatversion", async () => {
    const f = fake([
      json({ continue: { cmcontinue: "A", continue: "-||" }, query: { categorymembers: [{ title: "One" }] } }),
      json({ query: { categorymembers: [{ title: "Two" }] } }),
    ]);
    const c = new FandomClient(opts(f.fn));
    expect(await c.listCategoryMembers("Season 1 episodes")).toEqual(["One", "Two"]);
    expect(f.calls[0]!.searchParams.get("maxlag")).toBe("5");
    expect(f.calls[0]!.searchParams.get("formatversion")).toBe("2");
    expect(f.calls[0]!.searchParams.get("cmtitle")).toBe("Category:Season 1 episodes");
    expect(f.calls[1]!.searchParams.get("cmcontinue")).toBe("A");
    expect(f.headers[0]!.get("user-agent")).toBe("mentalist-archive-importer/0.1 (personal, non-commercial)");
  });

  it("retries on maxlag, 429, 5xx and network errors then succeeds", async () => {
    const f = fake([
      json({ error: { code: "maxlag" } }),
      new Response("", { status: 429, headers: { "retry-after": "1" } }),
      new Response("", { status: 503 }),
      new Error("network"),
      json({ query: { categorymembers: [{ title: "Ok" }] } }),
    ]);
    const c = new FandomClient(opts(f.fn));
    expect(await c.listCategoryMembers("C")).toEqual(["Ok"]);
    expect(f.calls).toHaveLength(5);
  });

  it("gives up after bounded retries", async () => {
    const f = fake(Array.from({ length: 10 }, () => json({ error: { code: "maxlag" } })));
    const c = new FandomClient(opts(f.fn, { maxRetries: 2 }));
    await expect(c.listCategoryMembers("C")).rejects.toThrow(/maxlag/);
    expect(f.calls).toHaveLength(3);
  });

  it("fails fast on non-retryable api errors", async () => {
    const f = fake([json({ error: { code: "badtitle", info: "bad" } })]);
    await expect(new FandomClient(opts(f.fn)).listCategoryMembers("C")).rejects.toThrow(/badtitle/);
    expect(f.calls).toHaveLength(1);
  });

  it("fetches pages in batches, merging categories across continuation", async () => {
    const f = fake([
      json({
        continue: { clcontinue: "z", continue: "||" },
        query: { pages: [pageBody("A", 1, ["Main"]), pageBody("B", 2)] },
      }),
      json({ query: { pages: [{ pageid: 1, title: "A", categories: [{ title: "Category:Extra" }] }] } }),
      json({ query: { pages: [pageBody("C", 3)] } }),
    ]);
    const c = new FandomClient(opts(f.fn));
    const pages = await c.getPages(["A", "B", "C"], { batchSize: 2 });
    expect(pages.map((p) => [p.title, p.revid, p.wikitext, p.categories])).toEqual([
      ["A", 1, "wt A", ["Main", "Extra"]],
      ["B", 2, "wt B", []],
      ["C", 3, "wt C", []],
    ]);
    expect(f.calls[0]!.searchParams.get("titles")).toBe("A|B");
    expect(f.calls[0]!.searchParams.get("redirects")).toBe("1");
    expect(f.calls[2]!.searchParams.get("titles")).toBe("C");
  });

  it("fetches a category with generator=categorymembers", async () => {
    const f = fake([json({ query: { pages: [pageBody("A", 1)] } })]);
    const pages = await new FandomClient(opts(f.fn)).getCategoryPages("Cat", { batchSize: 20 });
    expect(pages).toHaveLength(1);
    expect(f.calls[0]!.searchParams.get("generator")).toBe("categorymembers");
    expect(f.calls[0]!.searchParams.get("gcmtitle")).toBe("Category:Cat");
    expect(f.calls[0]!.searchParams.get("gcmlimit")).toBe("20");
  });

  it("resolves redirects", async () => {
    const f = fake([json({ query: { redirects: [{ from: "Old", to: "New" }], pages: [{ title: "New" }] } })]);
    const m = await new FandomClient(opts(f.fn)).resolveRedirects(["Old", "New"]);
    expect(m.get("Old")).toBe("New");
    expect(m.get("New")).toBe("New");
  });

  it("serves only from cache offline, and writes cache online", async () => {
    const dir = tmp();
    const online = fake([
      json({ query: { categorymembers: [{ title: "A" }] } }),
      json({ query: { pages: [pageBody("A", 7, ["Main"])] } }),
    ]);
    const c1 = new FandomClient(opts(online.fn, { cache: new FandomCache({ dir }) }));
    await c1.listCategoryMembers("C");
    await c1.getPages(["A"]);

    const off = fake([]);
    const c2 = new FandomClient(opts(off.fn, { cache: new FandomCache({ dir, offline: true }) }));
    expect(await c2.listCategoryMembers("C")).toEqual(["A"]);
    const [p] = await c2.getPages(["A"]);
    expect(p).toEqual({ title: "A", pageid: 7, revid: 7, wikitext: "wt A", categories: ["Main"] });
    await expect(c2.getPages(["Missing"])).rejects.toThrow(/offline/i);
    expect(off.calls).toHaveLength(0);
  });

  it("preferCache reads the request cache before fetching", async () => {
    const dir = tmp();
    const f1 = fake([json({ query: { categorymembers: [{ title: "A" }] } })]);
    await new FandomClient(opts(f1.fn, { cache: new FandomCache({ dir }) })).listCategoryMembers("C");
    const f2 = fake([]);
    const c = new FandomClient(opts(f2.fn, { cache: new FandomCache({ dir, preferCache: true }) }));
    expect(await c.listCategoryMembers("C")).toEqual(["A"]);
    expect(f2.calls).toHaveLength(0);
  });
});

describe.skipIf(process.env.FANDOM_LIVE !== "1")("live (opt-in)", () => {
  it("fetches the Pilot page", async () => {
    const c = new FandomClient({ baseUrl: "https://thementalist.fandom.com/api.php" });
    const [p] = await c.getPages(["Pilot"]);
    expect(p?.wikitext).toContain("Infobox episode");
  });
});
