import { describe, expect, it } from "vitest";
import { generateEpisodes } from "../../src/generate/episodes.ts";
import { BASE, ep, S1 } from "./helpers.ts";

const tm = (season: number, episode: number, overview: string) => ({ season, episode, name: "n", overview, airDate: null });

describe("generateEpisodes", () => {
  it("emits ordered episodes, cleaned titles, empty details and sources", () => {
    const g = generateEpisodes([S1[2]!, S1[0]!, S1[1]!], undefined, { wikiBase: BASE });
    expect(g.episodes).toEqual([
      { code: "S1E1", title: "Pilot", synopsis: "", details: "" },
      { code: "S1E2", title: "Second One", synopsis: "", details: "" },
      { code: "S1E3", title: "Third", synopsis: "", details: "" },
    ]);
    expect(g.sources).toContainEqual({ key: "src-s1e1", kind: "episode", episode: "S1E1", url: `${BASE}Pilot?oldid=101` });
    expect(g.sources).toContainEqual({ key: "src-wiki-s1e2", kind: "wiki", episode: "S1E2", url: `${BASE}Second_One?oldid=102` });
    expect(g.sources.some((s) => s.url?.includes("themoviedb"))).toBe(false);
    expect(g.stats).toMatchObject({ total: 3, missingSynopsis: 3, duplicates: 0 });
  });
  it("uses the TMDB overview and records the TMDB episode url", () => {
    const g = generateEpisodes(S1, [tm(1, 1, " Premise. "), tm(1, 2, "")], { wikiBase: BASE, tmdbShowId: 5920 });
    expect(g.episodes[0]!.synopsis).toBe("Premise.");
    expect(g.episodes[1]!.synopsis).toBe("");
    expect(g.sources).toContainEqual({ key: "src-tmdb-s1e1", kind: "other", url: "https://www.themoviedb.org/tv/5920/season/1/episode/1" });
    expect(g.stats.missingSynopsis).toBe(2);
  });
  it("strips markup from the TMDB overview", () => {
    const g = generateEpisodes(S1, [tm(1, 1, "A <b>b</b> [[c]] ''d'' {{e}}<ref>r</ref> mw-x")], { wikiBase: BASE, tmdbShowId: 5920 });
    expect(g.episodes[0]!.synopsis).not.toMatch(/<|\{\{|\[\[|''|mw-/);
    expect(g.episodes[0]!.synopsis).toContain("A b c d");
  });
  it("splits a double page into two episodes and counts duplicate codes once", () => {
    const g = generateEpisodes([ep(3, 23, "Dbl", 5), ep(3, 24, "Dbl", 5), ep(3, 23, "Other", 6)], undefined, { wikiBase: BASE });
    expect(g.episodes.map((e) => e.code)).toEqual(["S3E23", "S3E24"]);
    expect(g.stats.duplicates).toBe(1);
    expect(g.episodes[0]!.title).toBe("Dbl");
  });
  it("is deterministic regardless of input order", () => {
    expect(generateEpisodes([...S1].reverse(), undefined, { wikiBase: BASE })).toEqual(generateEpisodes(S1, undefined, { wikiBase: BASE }));
  });
});
