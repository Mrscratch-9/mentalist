import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { TmdbClient } from "../../src/tmdb/client.ts";

const dir = mkdtempSync(join(tmpdir(), "imp-tmdb-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
let n = 0;
const cacheDir = () => join(dir, `c${n++}`);

const V4 = "eyJ.fake.v4token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const V3 = "abcdef0123456789abcdef0123456789";

interface Call { url: string; headers: Record<string, string> }
function fake(handler: (c: Call, i: number) => Response) {
  const calls: Call[] = [];
  const f = (async (input: unknown, init?: { headers?: Record<string, string> }) => {
    const c = { url: String(input), headers: { ...(init?.headers ?? {}) } };
    calls.push(c);
    return handler(c, calls.length - 1);
  }) as unknown as typeof fetch;
  return { f, calls };
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

const seasonBody = {
  episodes: [
    { season_number: 1, episode_number: 1, name: "Pilot X", overview: "Synthetic.", air_date: "2000-01-02" },
    { season_number: 1, episode_number: 2, name: "Two", overview: "", air_date: null },
  ],
};

describe("TmdbClient", () => {
  it("sends Bearer, keeps the key out of URLs, maps episodes", async () => {
    const { f, calls } = fake(() => json(seasonBody));
    const c = new TmdbClient({ apiKey: V4, showId: 5920, fetch: f, cacheDir: cacheDir() });
    const eps = await c.getSeason(1, "en-US");
    expect(eps).toEqual([
      { season: 1, episode: 1, name: "Pilot X", overview: "Synthetic.", airDate: "2000-01-02" },
      { season: 1, episode: 2, name: "Two", overview: "", airDate: null },
    ]);
    expect(calls[0]!.url).toBe("https://api.themoviedb.org/3/tv/5920/season/1?language=en-US");
    expect(calls[0]!.headers.Authorization).toBe(`Bearer ${V4}`);
    expect(calls.every((x) => !x.url.includes(V4))).toBe(true);
  });

  it("v3 key falls back to api_key query only after a 401", async () => {
    const { f, calls } = fake((c) => (c.headers.Authorization ? json({}, 401) : json(seasonBody)));
    const c = new TmdbClient({ apiKey: V3, showId: 5920, fetch: f, cacheDir: cacheDir() });
    const eps = await c.getSeason(1, "en-US");
    expect(eps).toHaveLength(2);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.headers.Authorization).toBe(`Bearer ${V3}`);
    expect(calls[1]!.url).toContain(`api_key=${V3}`);
    // later calls reuse the discovered mode without another 401 round trip
    await c.getSeason(2, "en-US");
    expect(calls).toHaveLength(3);
    expect(calls[2]!.url).toContain("api_key=");
  });

  it("401 on a v4 token errors without the key", async () => {
    const { f, calls } = fake(() => json({}, 401));
    const c = new TmdbClient({ apiKey: V4, showId: 5920, fetch: f, cacheDir: cacheDir() });
    const err = await c.getSeason(1, "en-US").catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("TMDB_API_KEY is missing or invalid");
    expect(calls).toHaveLength(1);
  });

  it("missing key errors clearly", async () => {
    const { f } = fake(() => json(seasonBody));
    const c = new TmdbClient({ apiKey: undefined, showId: 5920, fetch: f, cacheDir: cacheDir() });
    await expect(c.getSeason(1, "en-US")).rejects.toThrow("TMDB_API_KEY is missing or invalid");
  });

  it("retries on 429 honoring Retry-After", async () => {
    const sleeps: number[] = [];
    const { f, calls } = fake((_c, i) => (i === 0 ? json({}, 429, { "Retry-After": "2" }) : json(seasonBody)));
    const c = new TmdbClient({
      apiKey: V4, showId: 5920, fetch: f, cacheDir: cacheDir(),
      sleep: async (ms) => { sleeps.push(ms); },
    });
    expect(await c.getSeason(1, "en-US")).toHaveLength(2);
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([2000]);
  });

  it("gives up after repeated 429 with no key in the error", async () => {
    const { f } = fake(() => json({}, 429, { "Retry-After": "0" }));
    const c = new TmdbClient({ apiKey: V4, showId: 5920, fetch: f, cacheDir: cacheDir(), sleep: async () => {} });
    const err = (await c.getSeason(1, "en-US").catch((e: Error) => e)) as Error;
    expect(err.message).toMatch(/429/);
    expect(err.message).not.toContain(V4);
  });

  it("serves the second call from the disk cache", async () => {
    const cd = cacheDir();
    const a = fake(() => json(seasonBody));
    await new TmdbClient({ apiKey: V4, showId: 5920, fetch: a.f, cacheDir: cd }).getSeason(1, "en-US");
    const b = fake(() => json({}, 500));
    const eps = await new TmdbClient({ apiKey: V4, showId: 5920, fetch: b.f, cacheDir: cd }).getSeason(1, "en-US");
    expect(eps).toHaveLength(2);
    expect(b.calls).toHaveLength(0);
  });

  it("getAllSeasons fetches 1..7 only, in order", async () => {
    const { f, calls } = fake((c) => {
      const s = Number(/season\/(\d+)/.exec(c.url)![1]);
      return json({ episodes: [{ season_number: s, episode_number: 1, name: "n", overview: "o", air_date: "2001-01-01" }] });
    });
    const c = new TmdbClient({ apiKey: V4, showId: 5920, fetch: f, cacheDir: cacheDir() });
    const eps = await c.getAllSeasons("en-US");
    expect(eps.map((e) => e.season)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(calls.some((x) => x.url.includes("season/0"))).toBe(false);
  });

  it("rejects season 0 and >7", async () => {
    const { f } = fake(() => json(seasonBody));
  
    const c = new TmdbClient({ apiKey: V4, showId: 5920, fetch: f, cacheDir: cacheDir() });
    await expect(c.getSeason(0, "en-US")).rejects.toThrow(/season/i);
    await expect(c.getSeason(8, "en-US")).rejects.toThrow(/season/i);
  });
});

describe("TmdbClient review fixes", () => {
  it("does not cache an empty or missing episodes list", async () => {
    for (const body of [{}, { episodes: [] }]) {
      const cd = cacheDir();
      const a = fake(() => json(body));
      await expect(
        new TmdbClient({ apiKey: V4, showId: 5920, fetch: a.f, cacheDir: cd }).getSeason(1, "en-US"),
      ).rejects.toThrow(/no episodes/i);
      const b = fake(() => json(seasonBody));
      const eps = await new TmdbClient({ apiKey: V4, showId: 5920, fetch: b.f, cacheDir: cd }).getSeason(1, "en-US");
      expect(eps).toHaveLength(2);
      expect(b.calls).toHaveLength(1);
    }
  });

  it("ignores cached JSON that is not an array of episodes", async () => {
    for (const bad of ["{}", "[]", "null", '"x"', '[{"foo":1}]', "not json"]) {
      const cd = cacheDir();
      mkdirSync(cd, { recursive: true });
      writeFileSync(join(cd, "5920-s1-en-US.json"), bad);
      const { f, calls } = fake(() => json(seasonBody));
      const eps = await new TmdbClient({ apiKey: V4, showId: 5920, fetch: f, cacheDir: cd }).getSeason(1, "en-US");
      expect(eps).toHaveLength(2);
      expect(calls).toHaveLength(1);
    }
  });

  it("a 429 without Retry-After (or with a non-numeric one) uses exponential backoff", async () => {
    for (const headers of [{}, { "Retry-After": "Wed, 21 Oct 2015 07:28:00 GMT" }] as Array<Record<string, string>>) {
      const sleeps: number[] = [];
      const { f } = fake((_c, i) => (i < 3 ? json({}, 429, headers) : json(seasonBody)));
      const c = new TmdbClient({
        apiKey: V4, showId: 5920, fetch: f, cacheDir: cacheDir(), sleep: async (ms) => void sleeps.push(ms),
      });
      await c.getSeason(1, "en-US");
      expect(sleeps).toEqual([1000, 2000, 4000]);
    }
  });

  it("a numeric Retry-After is honored in seconds", async () => {
    const sleeps: number[] = [];
    const { f } = fake((_c, i) => (i < 1 ? json({}, 429, { "Retry-After": "3" }) : json(seasonBody)));
    const c = new TmdbClient({
      apiKey: V4, showId: 5920, fetch: f, cacheDir: cacheDir(), sleep: async (ms) => void sleeps.push(ms),
    });
    await c.getSeason(1, "en-US");
    expect(sleeps).toEqual([3000]);
  });
});

describe("TmdbClient offline", () => {
  it("throws on a cache miss without any network call, even with a key", async () => {
    const f = (async () => {
      throw new Error("fetch must not be called");
    }) as unknown as typeof fetch;
    const c = new TmdbClient({ apiKey: V4, showId: 5920, fetch: f, cacheDir: cacheDir(), offline: true });
    await expect(c.getSeason(1, "en-US")).rejects.toThrow("offline: TMDB cache missing");
    await expect(c.getAllSeasons("en-US")).rejects.toThrow("offline: TMDB cache missing");
  });
  it("serves cached seasons when offline", async () => {
    const cd = cacheDir();
    const a = fake(() => json(seasonBody));
    await new TmdbClient({ apiKey: V4, showId: 5920, fetch: a.f, cacheDir: cd }).getSeason(1, "en-US");
    const f = (async () => {
      throw new Error("fetch must not be called");
    }) as unknown as typeof fetch;
    const eps = await new TmdbClient({ apiKey: undefined, showId: 5920, fetch: f, cacheDir: cd, offline: true }).getSeason(1, "en-US");
    expect(eps).toHaveLength(2);
  });
});
