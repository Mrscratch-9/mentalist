import { describe, expect, it } from "vitest";
import {
  KnowledgeEngine, InvalidInputError, NotFoundError, cacheKey, claimId, entityId, peek, progress,
  resolveProgress, endOfSeason, theoryId,
} from "../src/index.ts";
import { dbWith } from "./helpers.ts";
import { ID, tiny } from "./fixture.ts";

const mk = () => new KnowledgeEngine(dbWith(tiny()));
const P = progress;
const ids = (xs: Array<{ id: string }>) => xs.map((x) => x.id);

describe("S3 progress helpers", () => {
  it("resolves {season, episode} to the global ep_index; season end is inclusive", () => {
    const db = dbWith(tiny());
    expect(resolveProgress(db, { season: 2, episode: 2 }).epIndex).toBe(5);
    expect(endOfSeason(db, 1).epIndex).toBe(3);
    expect(() => resolveProgress(db, { season: 9, episode: 9 })).toThrow(NotFoundError);
  });
  it("rejects invalid progress values at runtime", () => {
    expect(() => progress(-1)).toThrow(InvalidInputError);
    expect(() => progress(1.5)).toThrow(InvalidInputError);
    expect(() => mk().listEntities({} as never)).toThrow(InvalidInputError);
  });
});

const grab = (f: () => unknown): Error => {
  try { f(); } catch (x) { return x as Error; }
  throw new Error("expected throw");
};

describe("L1 entity existence", () => {
  it("lists contain only introduced entities", () => {
    const e = mk();
    expect(ids(e.listEntities(P(1)))).toEqual([ID.orla, ID.hall, ID.arc1].sort());
    expect(e.listEntities(P(0))).toEqual([]);
  });
  it("hidden and nonexistent IDs give the identical not-found for every lookup", () => {
    const e = mk();
    const p = P(1);
    const pairs: Array<[() => unknown, () => unknown]> = [
      [() => e.getEntity(p, entityId(ID.bram)), () => e.getEntity(p, entityId("nope"))],
      [() => e.getClaim(p, claimId("c_name_bram")), () => e.getClaim(p, claimId("nope"))],
      [() => e.getCaseFile(p, entityId(ID.case1)), () => e.getCaseFile(p, entityId("nope"))],
      [() => e.getArc(P(0), entityId(ID.arc1)), () => e.getArc(P(0), entityId("nope"))],
      [() => e.getTheory(p, theoryId("t_b2")), () => e.getTheory(p, theoryId("nope"))],
    ];
    for (const [hidden, missing] of pairs) {
      const a = grab(hidden), b = grab(missing);
      expect(a).toBeInstanceOf(NotFoundError);
      expect(a.message).toBe(b.message);
      expect(a.name).toBe(b.name);
    }
  });
});

describe("L2/L3 names, aliases and claim content", () => {
  it("future alias and future claims are absent", () => {
    const e = mk();
    const d = e.getEntity(P(3), entityId(ID.orla));
    expect(d.claims.map((c) => c.id).sort()).toEqual(["c_knows_1", "c_name_orla", "c_role_orla_s"]);
    expect(JSON.stringify(d)).not.toContain("Vintner");
    expect(e.getEntity(P(4), entityId(ID.orla)).claims.map((c) => c.value)).toContain("Vintner");
  });
  it("a claim revealed before its subject exists stays hidden until the subject is introduced", () => {
    const e = mk();
    expect(e.listClaims(P(3)).map((c) => c.id)).not.toContain("c_early");
    expect(e.listClaims(P(4)).map((c) => c.id)).toContain("c_early");
  });
  it("a claim whose object is hidden is hidden", () => {
    const e = mk();
    expect(e.listClaims(P(3)).map((c) => c.id)).not.toContain("c_knows_2");
  });
});

describe("L4/L5 + §3.3 retracted beliefs", () => {
  const A = claimId("c_susp");
  it("p < revealed_in: nothing", () => {
    expect(() => mk().getClaim(P(1), A)).toThrow(NotFoundError);
  });
  it("revealed <= p < superseded_in: A is a current suspicion with no hint (L4)", () => {
    const e = mk();
    for (const n of [2, 3]) {
      const a = e.getClaim(P(n), A);
      expect(a.status).toBe("in_show_suspicion");
      expect(a.state).toBe("current");
      expect(a.supersession).toBeNull();
      expect(JSON.stringify(a)).not.toMatch(/c_truth|never owned/);
    }
  });
  it("p >= superseded_in: A is discarded in ep 4 and linked to B", () => {
    const e = mk();
    const a = e.getClaim(P(4), A);
    expect(a.state).toBe("discarded");
    expect(a.supersession).toEqual({ discardedIn: 4, replacedBy: "c_truth" });
    expect(e.getClaim(P(4), claimId("c_truth")).status).toBe("confirmed");
  });
  it("upgrade to confirmed is absent before its reveal (L5)", () => {
    const e = mk();
    expect(e.listClaims(P(3), { subject: entityId(ID.dara), predicate: "trait" }).map((c) => [c.id, c.status]))
      .toEqual([["c_susp", "in_show_suspicion"]]);
  });
  it("replacement link is withheld while B itself is not visible", () => {
    const d = dbWith(tiny());
    d.exec("UPDATE claim SET revealed_in = 6 WHERE id = 'c_truth'");
    const a = new KnowledgeEngine(d).getClaim(P(4), claimId("c_susp"));
    expect(a.supersession).toEqual({ discardedIn: 4, replacedBy: null });
  });
});

describe("L6 counts", () => {
  it("are computed from visible rows only", () => {
    const e = mk();
    expect(e.entityCounts(P(1)).person).toBe(1);
    expect(e.entityCounts(P(4)).person).toBe(3);
    expect(e.entityCounts(P(1)).organization).toBe(0);
    expect(e.claimCount(P(1))).toBe(2);
    expect(e.claimCount(P(0))).toBe(0);
    expect(e.getEntity(P(3), entityId(ID.orla)).claims).toHaveLength(3);
  });
});

describe("L7 search", () => {
  it("results, snippets and totals only come from visible claims", () => {
    const e = mk();
    expect(e.search(P(3), "vintner")).toEqual({ total: 0, hits: [] });
    const after = e.search(P(4), "vintner");
    expect(after.total).toBe(1);
    expect(after.hits[0]?.claimId).toBe("c_alias_orla");
    expect(after.hits[0]?.snippet).toContain("Vintner");
  });
  it("total ignores limit but never counts hidden rows", () => {
    const e = mk();
    expect(e.search(P(3), "zorvane").total).toBe(0);
    expect(e.search(P(4), "zorvane").total).toBe(1); // c_early, once Bram exists
    expect(e.search(P(5), "zorvane").total).toBe(2);
    expect(e.search(P(5), "zorvane", 1).hits).toHaveLength(1);
    expect(e.search(P(5), "zorvane", 1).total).toBe(2);
  });
  it("malformed queries neither leak nor surface SQL errors", () => {
    const e = mk();
    expect(e.search(P(6), `"" ( AND * NEAR`).hits).toBeInstanceOf(Array);
    expect(e.search(P(6), "   ")).toEqual({ total: 0, hits: [] });
  });
});

describe("L8 graph", () => {
  it("edges and degrees come from visible claims only", () => {
    const e = mk();
    const g3 = e.getGraph(P(3));
    expect(g3.edges.map((x) => x.claimId).sort()).toEqual(["c_knows_1", "c_role_dara", "c_role_orla_s"]);
    expect(g3.nodes.find((n) => n.id === ID.orla)?.degree).toBe(2);
    expect(g3.nodes.map((n) => n.id)).not.toContain(ID.bram);
    expect(e.getGraph(P(4)).nodes.find((n) => n.id === ID.orla)?.degree).toBe(3);
  });
});

describe("L9 map", () => {
  it("pins and filter values come from visible claims only", () => {
    const e = mk();
    const m4 = e.getMap(P(4));
    expect(m4.pins).toEqual([{ entityId: ID.hall, claimId: "c_hall_pos", lat: 10.5, lon: 20.5 }]);
    expect(m4.filters.kinds).toEqual(["location"]);
    expect(e.getMap(P(5)).pins.map((x) => x.entityId).sort()).toEqual([ID.dock, ID.hall].sort());
    expect(e.getMap(P(0))).toEqual({ pins: [], filters: { kinds: [] } });
  });
});

describe("case files (role_in_case)", () => {
  it("roles are gated; supersession follows §3.3", () => {
    const e = mk();
    const c4 = e.getCaseFile(P(4), entityId(ID.case1));
    expect(c4.roles.map((r) => [r.person, r.role, r.state]).sort()).toEqual(
      [[ID.dara, "victim", "current"], [ID.orla, "suspect", "current"]].sort(),
    );
    const c5 = e.getCaseFile(P(5), entityId(ID.case1));
    expect(c5.roles.map((r) => [r.role, r.state])).toContainEqual(["suspect", "discarded"]);
    expect(c5.roles.map((r) => r.role)).toContain("perpetrator");
    expect(c4.roles.map((r) => r.role)).not.toContain("perpetrator");
    expect(() => e.getCaseFile(P(6), entityId(ID.orla))).toThrow(NotFoundError);
  });
});

describe("L10 arcs", () => {
  it("items are gated and re-numbered so gaps do not reveal hidden items", () => {
    const e = mk();
    const a = e.getArc(P(2), entityId(ID.arc1));
    expect(a.items.map((i) => [i.position, i.narrative])).toEqual([[1, "First step"], [2, "Third step"]]);
    expect(JSON.stringify(a)).not.toContain("Hidden step");
    expect(e.getArc(P(5), entityId(ID.arc1)).items.map((i) => i.position)).toEqual([1, 2, 3]);
    expect(e.getArc(P(1), entityId(ID.arc1)).items.map((i) => i.narrative)).toEqual(["First step"]);
  });
  it("an item whose referenced claim is hidden is hidden even if its own revealed_in passed", () => {
    const d = dbWith(tiny());
    d.exec("UPDATE arc_item SET revealed_in = 1 WHERE narrative_text = 'Hidden step'");
    const a = new KnowledgeEngine(d).getArc(P(2), entityId(ID.arc1));
    expect(JSON.stringify(a)).not.toContain("Hidden step");
  });
});

describe("L11 opaque IDs", () => {
  it("ID columns are text and views return stored IDs unchanged (no counters)", () => {
    const db = dbWith(tiny());
    const cols = (t: string) =>
      db.all<{ name: string; type: string }>(`PRAGMA table_info(${t})`).filter((c) => c.name === "id");
    for (const t of ["entity", "claim", "theory"]) expect(cols(t)[0]?.type).toBe("TEXT");
    expect(ids(new KnowledgeEngine(db).listEntities(P(6))).sort()).toEqual(Object.values(ID).sort());
  });
});

describe("L12 episodes", () => {
  it("unwatched episodes expose only season, number, title, synopsis", () => {
    const e = mk();
    const eps = e.listEpisodes(P(2));
    expect(eps).toHaveLength(6);
    expect(eps[0]).toEqual({
      watched: true, epIndex: 1, season: 1, number: 1, title: "Title 1", synopsis: "Synopsis 1", details: "Details 1",
    });
    expect(eps[2]).toEqual({ watched: false, season: 1, number: 3, title: "Title 3", synopsis: "Synopsis 3" });
    expect(Object.keys(e.getEpisode(P(0), { season: 2, number: 3 })).sort())
      .toEqual(["number", "season", "synopsis", "title", "watched"]);
    expect(e.getEpisode(P(6), { season: 2, number: 3 })).toMatchObject({ watched: true, epIndex: 6 });
    expect(() => e.getEpisode(P(6), { season: 8, number: 8 })).toThrow(NotFoundError);
  });
});

describe("theories (non-canon)", () => {
  it("are gated by spoils_up_to and always flagged non-canon", () => {
    const e = mk();
    expect(e.listTheories(P(1))).toEqual([]);
    expect(e.listTheories(P(2)).map((t) => [t.id, t.canon])).toEqual([["t_a1", false]]);
    expect(e.listTheories(P(6), "places").map((t) => t.id)).toEqual(["t_b2"]);
    expect(e.getTheory(P(6), theoryId("t_b2")).authorHandle).toBeNull();
  });
});

describe("L13 cache keys", () => {
  it("include p", () => {
    expect(cacheKey("entities", P(3))).not.toBe(cacheKey("entities", P(5)));
    expect(cacheKey("entity", P(3), "x")).toContain("p=3");
  });
});

describe("L14 errors", () => {
  it("never echo hidden data or caller input", () => {
    const e = mk();
    const errs = [
      grab(() => e.getEntity(P(1), entityId(ID.bram))),
      grab(() => e.getClaim(P(1), claimId("c_name_bram"))),
      grab(() => e.getEpisode(P(1), { season: 2, number: 99 })),
      grab(() => resolveProgress(dbWith(tiny()), { season: 7, episode: 77 })),
    ];
    for (const x of errs) {
      expect(x.message).toBe("Not found");
      expect(x.message).not.toMatch(/e_q7m2|c_name_bram|99|77|Bram/);
    }
    expect(() => progress(NaN)).toThrow("Invalid progress");
  });
});

describe("L15 peek", () => {
  it("is p+1, a new value, and is never persisted", () => {
    const db = dbWith(tiny());
    const before = db.all("SELECT name FROM sqlite_master ORDER BY name");
    const p = P(3), q = peek(p);
    expect(q.epIndex).toBe(4);
    expect(p.epIndex).toBe(3);
    const e = new KnowledgeEngine(db);
    expect(e.getClaim(q, claimId("c_susp")).state).toBe("discarded");
    expect(e.getClaim(p, claimId("c_susp")).state).toBe("current");
    expect(db.all("SELECT name FROM sqlite_master ORDER BY name")).toEqual(before);
    expect(db.all("SELECT name FROM sqlite_master WHERE name LIKE '%progress%' OR name LIKE '%peek%'")).toEqual([]);
  });
});
