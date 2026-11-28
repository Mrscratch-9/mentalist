/// <reference types="node" />
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  KnowledgeEngine, loadDataset, progress,
  type Claim, type Dataset, type Entity, type EntityKind, type SqlDriver, type SqlValue,
} from "@mentalist/core";
import { buildCaseMap, chronologyPath, flyTarget, redString } from "./caseMap";

function nodeDriver(): SqlDriver {
  const raw = new DatabaseSync(":memory:");
  return {
    all: <T>(sql: string, p?: SqlValue[]) => raw.prepare(sql).all(...(p ?? [])) as T[],
    get: <T>(sql: string, p?: SqlValue[]) => raw.prepare(sql).get(...(p ?? [])) as T | undefined,
    exec: (sql, p) => {
      if (p && p.length) raw.prepare(sql).run(...p);
      else raw.exec(sql);
    },
  };
}

const episodes = [1, 2, 3, 4, 5].map((n) => ({
  epIndex: n, season: 1, number: n, title: `Title ${n}`, synopsis: `Synopsis ${n}`, details: `CANARY_EP_${n} details`,
}));
const ent = (id: string, kind: EntityKind, introducedIn: number): Entity => ({ id, kind, introducedIn }) as Entity;
const clm = (id: string, subject: string, predicate: string, revealedIn: number, f: { object?: string; value?: string } = {}): Claim =>
  ({
    id, subject, predicate, object: f.object ?? null, value: f.value ?? null, revealedIn,
    supersededIn: null, supersededBy: null, status: "confirmed", sourceId: "src", note: "",
  }) as unknown as Claim;
const place = (loc: string, ep: number, c: string, coords: string | null, caseSiteAt?: number): Claim[] => [
  clm(`n_${loc}`, loc, "name", ep, { value: `Place ${loc}` }),
  clm(`k_${loc}`, loc, "part_of_case", ep, { object: c }),
  ...(coords ? [clm(`c_${loc}`, loc, "coordinates", ep, { value: coords })] : []),
  ...(caseSiteAt ? [clm(`s_${loc}`, loc, "case_site", caseSiteAt, { value: "true" })] : []),
];

function synthetic(): Dataset {
  return {
    episodes,
    entities: [
      ent("p1", "person", 1), ent("p2", "person", 2), ent("a1", "arc", 1),
      ent("c1", "case", 1), ent("c2", "case", 2), ent("c3", "case", 3), ent("c4", "case", 4),
      ent("l1a", "location", 1), ent("l1b", "location", 1), ent("l2", "location", 2),
      ent("l3", "location", 3), ent("l4", "location", 4),
    ],
    claims: [
      ...["c1", "c2", "c3", "c4"].map((c, i) => clm(`n_${c}`, c, "name", i + 1, { value: `Case ${c}` })),
      ...place("l1a", 1, "c1", "10,20"),
      ...place("l1b", 1, "c1", "11,21", 3), // flagged as the case site starting at episode 3
      ...place("l2", 2, "c2", "12,22"),
      ...place("l3", 3, "c3", null), // no coordinates: c3 has no place
      ...place("l4", 4, "c4", "14,24"),
      clm("r_p1_c1", "p1", "role_in_case", 1, { object: "c1", value: "witness" }),
      clm("r_p1_c2", "p1", "role_in_case", 2, { object: "c2", value: "witness" }),
      clm("r_p2_c2", "p2", "role_in_case", 2, { object: "c2", value: "victim" }),
      clm("r_p2_c4", "p2", "role_in_case", 5, { object: "c4", value: "victim" }), // hidden before episode 5
    ],
    arcItems: [
      { arc: "a1", order: 1, refClaim: null, refEntity: "c1", narrativeText: "x", revealedIn: 1 },
      { arc: "a1", order: 2, refClaim: null, refEntity: "c4", narrativeText: "y", revealedIn: 5 }, // hidden before 5
    ],
    theories: [],
  } as unknown as Dataset;
}
function setup() {
  const db = nodeDriver();
  loadDataset(db, synthetic());
  return new KnowledgeEngine(db);
}
const dump = (x: unknown) => JSON.stringify(x);

describe("case place selection", () => {
  it("prefers the case_site location; before it is flagged, the first linked one with coordinates", () => {
    const e = setup();
    expect(buildCaseMap(e, progress(2), "en").stops[0]?.place).toMatchObject({ locationId: "l1a", position: [20, 10] });
    expect(buildCaseMap(e, progress(3), "en").stops[0]?.place).toMatchObject({ locationId: "l1b", position: [21, 11] });
  });
  it("a case whose locations have no coordinates has no place; no fly target, no error", () => {
    const m = buildCaseMap(setup(), progress(4), "en");
    expect(m.stops.find((s) => s.caseId === "c3")?.place).toBeNull();
    expect(flyTarget(m, "c3")).toBeNull();
    expect(flyTarget(m, "nope")).toBeNull();
    expect(flyTarget(m, "c2")).toEqual([22, 12]);
  });
  it("hides places of cases beyond progress", () => {
    const m = buildCaseMap(setup(), progress(2), "en");
    expect(m.stops.map((s) => s.caseId)).toEqual(["c1", "c2"]);
    expect(flyTarget(m, "c4")).toBeNull();
    expect(dump(m)).not.toMatch(/l4|c4|CANARY/);
  });
});

describe("chronology", () => {
  it("orders the watched cases by episode and draws the path through placed ones only", () => {
    const m = buildCaseMap(setup(), progress(4), "en");
    expect(m.stops.map((s) => [s.caseId, s.code])).toEqual([["c1", "1x01"], ["c2", "1x02"], ["c3", "1x03"], ["c4", "1x04"]]);
    expect(chronologyPath(m, 0)).toEqual([[21, 11]]);
    expect(chronologyPath(m, 2)).toEqual([[21, 11], [22, 12]]); // c3 has no place: skipped
    expect(chronologyPath(m, 3)).toEqual([[21, 11], [22, 12], [24, 14]]);
  });
  it("has no stops without watched cases", () => {
    expect(buildCaseMap(setup(), progress(0), "en").stops).toEqual([]);
  });
});

describe("red string", () => {
  it("links cases that share a person, and the thread follows the chronology", () => {
    const m = buildCaseMap(setup(), progress(4), "en");
    const r = redString(m, null);
    expect(r.thread).toEqual([[21, 11], [22, 12], [24, 14]]);
    expect(r.links).toEqual([{ a: "c1", b: "c2", via: "person", from: [21, 11], to: [22, 12] }]);
  });
  it("hidden claims and arc items produce no link", () => {
    const m = buildCaseMap(setup(), progress(4), "en");
    expect(m.links.some((l) => l.a === "c4" || l.b === "c4")).toBe(false);
  });
  it("adds the links once their claims are visible (person and arc)", () => {
    const m = buildCaseMap(setup(), progress(5), "en");
    expect(m.links).toEqual([
      { a: "c1", b: "c2", via: "person" },
      { a: "c1", b: "c4", via: "arc" },
      { a: "c2", b: "c4", via: "person" },
    ]);
  });
  it("in chronology mode only reaches the current step", () => {
    const m = buildCaseMap(setup(), progress(5), "en");
    expect(redString(m, 0)).toEqual({ thread: [[21, 11]], links: [] });
    expect(redString(m, 1).links.map((l) => `${l.a}-${l.b}`)).toEqual(["c1-c2"]);
    expect(redString(m, 3).links).toHaveLength(3);
  });
  it("draws no link to a case without a place", () => {
    const m = buildCaseMap(setup(), progress(5), "en");
    expect(redString(m, null).links.every((l) => l.a !== "c3" && l.b !== "c3")).toBe(true);
  });
});

