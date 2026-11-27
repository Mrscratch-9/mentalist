import { describe, expect, it } from "vitest";
import { generateCharacters, personName } from "../../src/generate/characters.ts";
import { createLinkResolver } from "../../src/generate/links.ts";
import { BASE, ch, ep, S1 } from "./helpers.ts";

const resolver = createLinkResolver({ episodes: S1 });

describe("generateCharacters", () => {
  const recs = [
    ch("Patrick Jane", { gatingAlias: "Final Name", actor: "A B", categories: ["Main characters"] }),
    ch("Lee Minor", { first: "Second One", categories: ["Minor Characters"] }),
    ch("Rec One", { first: "Third (episode)", categories: ["Recurring characters"] }),
    ch("Lost", { first: "Unknown Page" }),
    ch("NoFirst", { first: null }),
  ];
  const g = generateCharacters(recs, resolver, { wikiBase: BASE, episodes: S1 });

  it("creates persons keyed p-slug introduced at the first episode, sorted by key", () => {
    expect(g.entities).toEqual([
      { key: "p-lee-minor", kind: "person", introduced: "S1E2" },
      { key: "p-patrick-jane", kind: "person", introduced: "S1E1" },
      { key: "p-rec-one", kind: "person", introduced: "S1E3" },
    ]);
  });
  it("emits name/actor/recurring claims (never role) revealed at introduction with an episode-bound wiki source and page note", () => {
    const jane = g.claims.filter((c) => c.subject === "p-patrick-jane");
    expect(jane.map((c) => [c.predicate, c.value]).sort()).toEqual([
      ["actor", "A B"], ["name", "Patrick Jane"], ["recurring", "true"], // main + introduced in the pilot
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

describe("person names and cleaned text", () => {
  it("personName strips disambiguation and markup from the page title", () => {
    expect(personName("Rec One (character)")).toBe("Rec One");
    expect(personName("[[A]] <b>B</b> ''C''")).toBe("A B C");
  });
  it("name claim is the cleaned page title, actor is cleaned, and no role claim is ever emitted", () => {
    const g = generateCharacters(
      [ch("Rec One (character)", { gatingAlias: "Other Final", actor: "<div class=\"mw-x\">Act</div> [[Or]]", categories: ["Main characters"] })],
      resolver, { wikiBase: BASE, episodes: S1 },
    );
    const v = Object.fromEntries(g.claims.map((c) => [c.predicate, c.value]));
    expect(v).toMatchObject({ name: "Rec One", actor: "Act Or" });
    expect(g.claims.some((c) => c.predicate === "role" || c.value === "Other Final")).toBe(false);
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

describe("actor claims only from credits (no identity leak)", () => {
  const cr = (role: string, actor: string, characterPage?: string) => ({ role, actor, ...(characterPage ? { characterPage } : {}) });
  const eps = [
    ep(1, 1, "Pilot", 101, { guests: [cr("Credited Intro", "Act One", "Credited Intro")] }),
    ep(1, 2, "Second One", 102, { recurring: [cr("Late Credit", "Act Two", "Late Credit")] }),
    ep(1, 3, "Third (episode)", 103, { guests: [cr("Late Credit", "Act Two", "Late Credit"), cr("Wrong Actor", "Someone Else", "Wrong Actor")] }),
  ];
  const run = (recs: ReturnType<typeof ch>[]) =>
    generateCharacters(recs, createLinkResolver({ episodes: eps }), { wikiBase: BASE, episodes: eps });
  const actor = (g: ReturnType<typeof run>, title: string) => g.claims.find((c) => c.subject === `p-${title}` && c.predicate === "actor");

  it("keeps the actor at the introduction when credited there", () => {
    const g = run([ch("Credited Intro", { actor: "Act One" })]);
    expect(actor(g, "credited-intro")).toMatchObject({ value: "Act One", revealed: "S1E1", source: "src-wiki-s1e1" });
    expect(g.stats).toMatchObject({ actorsKept: 1, actorsMoved: 0, actorsDropped: 0 });
  });
  it("moves the actor to the first episode that credits it, sourced to that episode", () => {
    const g = run([ch("Late Credit", { actor: "Act Two" })]);
    expect(actor(g, "late-credit")).toMatchObject({ value: "Act Two", revealed: "S1E2", source: "src-wiki-s1e2" });
    expect(g.claims.find((c) => c.subject === "p-late-credit" && c.predicate === "name")?.revealed).toBe("S1E1");
    expect(g.stats).toMatchObject({ actorsKept: 0, actorsMoved: 1, actorsDropped: 0 });
  });
  it("drops the actor when never credited for the character (also when credited with another actor)", () => {
    const g = run([ch("Never Credited", { actor: "Act Three" }), ch("Wrong Actor", { actor: "Act Four", first: "Third (episode)" })]);
    expect(g.claims.filter((c) => c.predicate === "actor")).toEqual([]);
    expect(g.stats).toMatchObject({ actorsKept: 0, actorsMoved: 0, actorsDropped: 2 });
  });
  it("does not apply the main-pilot exception to a mystery identity (Red John)", () => {
    const g = run([ch("Red John", { actor: "Act Eight", categories: ["Main characters"] })]);
    expect(actor(g, "red-john")).toBeUndefined();
    expect(g.stats).toMatchObject({ actorsKept: 0, actorsDropped: 1 });
  });
  it("accepts a main character's actor at a pilot introduction without credits, but not elsewhere", () => {
    const g = run([
      ch("Main Pilot", { actor: "Act Five", categories: ["Main characters"] }),
      ch("Main Late", { actor: "Act Six", first: "Second One", categories: ["Main characters"] }),
      ch("Recurring Pilot", { actor: "Act Seven", categories: ["Recurring characters"] }),
    ]);
    expect(actor(g, "main-pilot")).toMatchObject({ value: "Act Five", revealed: "S1E1" });
    expect(actor(g, "main-late")).toBeUndefined();
    expect(actor(g, "recurring-pilot")).toBeUndefined();
    expect(g.stats).toMatchObject({ actorsKept: 1, actorsDropped: 2 });
  });
});
