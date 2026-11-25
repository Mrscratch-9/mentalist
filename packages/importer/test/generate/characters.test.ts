import { describe, expect, it } from "vitest";
import { generateCharacters, roleFromJob } from "../../src/generate/characters.ts";
import { createLinkResolver } from "../../src/generate/links.ts";
import { BASE, ch, S1 } from "./helpers.ts";

const resolver = createLinkResolver({ episodes: S1 });

describe("roleFromJob", () => {
  it.each([
    ["Consultant, later agent", "Consultant"],
    ["Detective (retired in S5)", "Detective"],
    ["CBI Agent; then FBI", "CBI Agent"],
    ["Agent / Boss", "Agent"],
    ["Analyst then manager", "Analyst"],
    ["Plain Job", "Plain Job"],
    ["", null],
    [null, null],
  ])("%s", (job, want) => expect(roleFromJob(job)).toBe(want));
});

describe("generateCharacters", () => {
  const recs = [
    ch("Patrick Jane", { actor: "A B", job: "Consultant, later other", categories: ["Main characters"] }),
    ch("Lee Minor", { first: "Second One", categories: ["Minor Characters"] }),
    ch("Rec One", { first: "Third (episode)", categories: ["Recurring characters"], job: null }),
    ch("Lost", { first: "Unknown Page" }),
    ch("NoFirst", { first: null }),
  ];
  const g = generateCharacters(recs, resolver, { wikiBase: BASE });

  it("creates persons keyed p-slug introduced at the first episode, sorted by key", () => {
    expect(g.entities).toEqual([
      { key: "p-lee-minor", kind: "person", introduced: "S1E2" },
      { key: "p-patrick-jane", kind: "person", introduced: "S1E1" },
      { key: "p-rec-one", kind: "person", introduced: "S1E3" },
    ]);
  });
  it("emits name/actor/role/recurring claims revealed at introduction with an episode-bound wiki source and page note", () => {
    const jane = g.claims.filter((c) => c.subject === "p-patrick-jane");
    expect(jane.map((c) => [c.predicate, c.value]).sort()).toEqual([
      ["actor", "A B"], ["name", "Patrick Jane"], ["recurring", "true"], ["role", "Consultant"],
    ]);
    for (const c of jane) {
      expect(c).toMatchObject({ revealed: "S1E1", source: "src-wiki-s1e1", note: `${BASE}Patrick_Jane?oldid=7` });
    }
    expect(g.claims.filter((c) => c.subject === "p-lee-minor").map((c) => c.predicate)).toEqual(["name"]);
    expect(g.claims.find((c) => c.subject === "p-rec-one" && c.predicate === "recurring")?.source).toBe("src-wiki-s1e3");
  });
  it("never emits status/last/family predicates and has unique claim keys", () => {
    expect(g.claims.some((c) => /status|last|family/.test(c.predicate))).toBe(false);
    expect(new Set(g.claims.map((c) => c.key)).size).toBe(g.claims.length);
  });
  it("counts skipped characters", () => {
    expect(g.stats).toMatchObject({ persons: 3, recurring: 2, skippedNoFirst: 1, skippedUnresolved: 1 });
    expect(g.personsByTitle.get("patrick jane")).toEqual({ key: "p-patrick-jane", introduced: "S1E1" });
  });
  it("skips a slug collision and counts it", () => {
    const c = generateCharacters([ch("A-B"), ch("A B")], resolver, { wikiBase: BASE });
    expect(c.entities).toHaveLength(1);
    expect(c.stats.keyCollisions).toBe(1);
  });
});

describe("generateCharacters last appearance (gating only)", () => {
  const g = generateCharacters(
    [
      ch("Has Last", { lastEpisode: "Second One" }),
      ch("No Last", { lastEpisode: null }),
      ch("Bad Last", { lastEpisode: "Nowhere" }),
    ],
    resolver,
    { wikiBase: BASE },
  );
  it("resolves last to an episode code, or the finale when missing/unresolvable", () => {
    expect(g.lastByTitle.get("has last")).toBe("S1E2");
    expect(g.lastByTitle.get("no last")).toBe("S7E13");
    expect(g.lastByTitle.get("bad last")).toBe("S7E13");
  });
  it("never emits it as a claim or on the person", () => {
    expect(g.claims.every((c) => !/last/.test(c.predicate) && !/S1E2/.test(c.value))).toBe(true);
    expect(g.entities.every((e) => Object.keys(e).sort().join() === "introduced,key,kind")).toBe(true);
  });
});
