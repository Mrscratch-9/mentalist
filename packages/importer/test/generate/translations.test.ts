import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadDir, textHash, validate, resolveI18n } from "@mentalist/pipeline";
import { generateEpisodes } from "../../src/generate/episodes.ts";
import { fetchEpisodeTranslations, generateEpisodeTranslations, langDir } from "../../src/generate/translations.ts";
import { renderYaml } from "../../src/generate/write.ts";
import { TmdbClient } from "../../src/tmdb/client.ts";
import { BASE, S1 } from "./helpers.ts";

const dir = mkdtempSync(join(tmpdir(), "imp-i18n-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
let n = 0;
const cacheDir = () => join(dir, `c${n++}`);

const tm = (season: number, episode: number, name: string, overview: string) => ({ season, episode, name, overview, airDate: null });
const english = generateEpisodes(S1, [tm(1, 1, "n", "CANARY_EN one."), tm(1, 2, "n", "")], { wikiBase: BASE, tmdbShowId: 5920 }).episodes;

describe("generateEpisodeTranslations", () => {
  it("emits title and synopsis entries keyed by episode code, hashed from the English text", () => {
    const g = generateEpisodeTranslations(english, [tm(1, 1, "CANARY_ES Piloto", " CANARY_ES uno. "), tm(1, 2, "CANARY_ES Segundo", "CANARY_ES dos.")]);
    expect(g.doc.translations).toEqual([
      { key: "S1E1", field: "synopsis", hash: textHash("CANARY_EN one."), text: "CANARY_ES uno." },
      { key: "S1E1", field: "title", hash: textHash("Pilot"), text: "CANARY_ES Piloto" },
      { key: "S1E2", field: "title", hash: textHash("Second One"), text: "CANARY_ES Segundo" },
      // S1E2 has no English synopsis: nothing to translate (the key would be rejected by the pipeline)
    ]);
    expect(g.stats).toEqual({ titles: 2, synopses: 1, missing: 1 });
  });

  it("skips empty and missing secondary texts, cleans markup, and ignores unknown episodes", () => {
    const g = generateEpisodeTranslations(english, [tm(1, 1, "", "<b>CANARY_ES</b> [[x]] uno"), tm(9, 9, "ZZ", "ZZ")]);
    expect(g.doc.translations).toEqual([
      { key: "S1E1", field: "synopsis", hash: textHash("CANARY_EN one."), text: "CANARY_ES x uno" },
    ]);
    expect(JSON.stringify(g.doc)).not.toMatch(/<|\[\[|ZZ/);
  });

  it("is deterministic and sorted by code then field", () => {
    const sec = [tm(1, 2, "B", ""), tm(1, 1, "A", "S")];
    expect(generateEpisodeTranslations(english, sec)).toEqual(generateEpisodeTranslations(english, [...sec].reverse()));
  });

  it("its output validates with the pipeline and compiles to current (not stale) rows", () => {
    const g = generateEpisodeTranslations(english, [tm(1, 1, "CANARY_ES Piloto", "CANARY_ES uno"), tm(1, 3, "CANARY_ES Tercero", "")]);
    const root = join(dir, "pipe");
    mkdirSync(join(root, "i18n", "es"), { recursive: true });
    writeFileSync(join(root, "e.yaml"), renderYaml({ episodes: english }));
    writeFileSync(join(root, "i18n", "es", "episodes.yaml"), renderYaml(g.doc));
    const { docs, i18n, errors } = loadDir(root);
    expect(errors).toEqual([]);
    expect(validate(docs, i18n)).toEqual([]);
    const r = resolveI18n(docs, i18n);
    expect(r.stale).toEqual([]);
    expect(r.translations).toHaveLength(3);
  });
});

describe("langDir / fetchEpisodeTranslations (fake fetch, no network)", () => {
  it("reduces a locale to its base language directory", () => {
    expect(langDir("es-MX")).toBe("es");
    expect(langDir("EN-us")).toBe("en");
  });

  const body = (n: string) => ({ episodes: [{ season_number: 1, episode_number: 1, name: `${n} name`, overview: `${n} text` }] });
  const fakeFetch = (urls: string[]) => (async (u: unknown) => {
    urls.push(String(u));
    return new Response(JSON.stringify(body(String(u).includes("language=es-MX") ? "CANARY_ES" : "CANARY_EN")), { status: 200 });
  }) as unknown as typeof fetch;

  it("requests the secondary language for every season and builds the file content", async () => {
    const urls: string[] = [];
    const c = new TmdbClient({ apiKey: "k", showId: 5920, fetch: fakeFetch(urls), cacheDir: cacheDir() });
    const r = await fetchEpisodeTranslations(c, english, "es-MX");
    expect(urls).toHaveLength(7);
    expect(urls.every((u) => u.endsWith("language=es-MX"))).toBe(true);
    expect(r?.lang).toBe("es");
    expect(r?.doc.translations.map((t) => [t.key, t.field, t.text])).toEqual([
      ["S1E1", "synopsis", "CANARY_ES text"], ["S1E1", "title", "CANARY_ES name"],
    ]);
  });

  it("offline with no secondary cache: returns undefined, never touches the network", async () => {
    const urls: string[] = [];
    const c = new TmdbClient({ apiKey: undefined, showId: 5920, fetch: fakeFetch(urls), cacheDir: cacheDir(), offline: true });
    expect(await fetchEpisodeTranslations(c, english, "es-MX")).toBeUndefined();
    expect(urls).toEqual([]);
  });

  it("online failures are not swallowed", async () => {
    const f = (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;
    const c = new TmdbClient({ apiKey: "k", showId: 5920, fetch: f, cacheDir: cacheDir(), maxRetries: 0 });
    await expect(fetchEpisodeTranslations(c, english, "es-MX")).rejects.toThrow(/TMDB/);
  });

  it("the primary language is not fetched twice: same base language gives undefined", async () => {
    const urls: string[] = [];
    const c = new TmdbClient({ apiKey: "k", showId: 5920, fetch: fakeFetch(urls), cacheDir: cacheDir() });
    expect(await fetchEpisodeTranslations(c, english, "en-GB", "en-US")).toBeUndefined();
    expect(urls).toEqual([]);
  });
});
