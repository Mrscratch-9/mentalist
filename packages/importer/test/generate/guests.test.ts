import { describe, expect, it } from "vitest";
import { generateGuests } from "../../src/generate/guests.ts";
import { createLinkResolver } from "../../src/generate/links.ts";
import { BASE, ep } from "./helpers.ts";

const persons = new Map([
  ["guest a", { key: "p-guest-a", introduced: "S1E1" }],
  ["guest b", { key: "p-guest-b", introduced: "S1E2" }],
]);
const credit = (role: string, characterPage?: string) => ({ role, actor: "X", ...(characterPage ? { characterPage } : {}) });

describe("generateGuests", () => {
  const eps = [
    ep(1, 1, "Pilot", 1, { guests: [credit("Guest A", "Guest A"), credit("Unlinked"), credit("Ghost", "Ghost Page")], recurring: [credit("Guest A", "Guest A")] }),
    ep(1, 2, "Two", 2, { guests: [credit("Guest B", "Guest B")], recurring: [credit("Guest A", "Guest A")] }),
    ep(1, 3, "Three", 3, { guests: [credit("Guest B", "Guest B")] }),
  ];
  const g = generateGuests(eps, createLinkResolver({ episodes: eps, persons }), { wikiBase: BASE });
  it("emits one appears_in per person per episode, revealed there with that episode's wiki source", () => {
    expect(g.claims.map((c) => [c.subject, c.predicate, c.value, c.revealed, c.source])).toEqual([
      ["p-guest-a", "appears_in", "S1E1", "S1E1", "src-wiki-s1e1"],
      ["p-guest-a", "appears_in", "S1E2", "S1E2", "src-wiki-s1e2"],
      ["p-guest-b", "appears_in", "S1E2", "S1E2", "src-wiki-s1e2"],
      ["p-guest-b", "appears_in", "S1E3", "S1E3", "src-wiki-s1e3"],
    ]);
    expect(g.claims[0]!.note).toBe(`${BASE}Pilot?oldid=1`);
    expect(new Set(g.claims.map((c) => c.key)).size).toBe(4);
  });
  it("counts credits without a page, unknown persons", () => {
    expect(g.stats).toMatchObject({ claims: 4, unlinked: 1, unknownPerson: 1, beforeIntroduction: 0 });
  });
  it("skips appearances before the person's introduction", () => {
    const late = new Map([["guest a", { key: "p-guest-a", introduced: "S1E3" }]]);
    const r = generateGuests([eps[0]!], createLinkResolver({ episodes: eps, persons: late }), { wikiBase: BASE });
    expect(r.claims).toEqual([]);
    expect(r.stats.beforeIntroduction).toBe(1);
  });
});
