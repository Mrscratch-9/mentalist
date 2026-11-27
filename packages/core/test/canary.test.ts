import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  ENTITY_KINDS, KnowledgeEngine, claimId, entityId, episodeTargetId, inLanguage, loadDataset, progress, theoryId,
  type Dataset, type EntityKind,
} from "../src/index.ts";
import { nodeDriver } from "./helpers.ts";

/**
 * §6 canary: every free-text field and every ID carries a CANARY_EP_n token where n is the
 * episode at which that row becomes visible. Predicates and kinds are a closed vocabulary
 * (the engine keys behaviour on them), so they carry no token. Episode title/synopsis are public by
 * design (L12), so they carry PUBLIC_EP_n instead; episode `details` is the gated field and carries the canary.
 */
const N = 12;
const tok = (n: number) => `CANARY_EP_${n}`;

function canaryDataset(): Dataset {
  const d: Dataset = { episodes: [], entities: [], claims: [], arcItems: [], theories: [] };
  for (let n = 1; n <= N; n++) {
    d.episodes.push({
      epIndex: n, season: Math.ceil(n / 4), number: ((n - 1) % 4) + 1,
      title: `title PUBLIC_EP_${n}`, synopsis: `synopsis PUBLIC_EP_${n}`, details: `details ${tok(n)}`,
    });
  }
  const kinds: EntityKind[] = [...ENTITY_KINDS];
  const entIds: Array<{ id: string; n: number; kind: EntityKind }> = [];
  for (let n = 1; n <= N; n++) {
    for (let k = 0; k < 3; k++) {
      const kind = kinds[(n + k) % kinds.length] as EntityKind;
      const id = `e_${tok(n)}_${k}`;
      entIds.push({ id, n, kind });
      d.entities.push({ id: entityId(id), kind, introducedIn: n });
    }
  }
  let cc = 0;
  const claimIds: Array<{ id: string; n: number }> = [];
  const addClaim = (
    subj: { id: string; n: number }, predicate: string, rev: number,
    o: { object?: string; value?: string; status?: "confirmed" | "in_show_suspicion"; supIn?: number; supBy?: string } = {},
  ) => {
    const id = `c_${tok(rev)}_${cc++}`;
    claimIds.push({ id, n: rev });
    d.claims.push({
      id: claimId(id), subject: entityId(subj.id), predicate,
      object: o.object ? entityId(o.object) : null, value: o.value ?? null,
      revealedIn: rev, supersededIn: o.supIn ?? null, supersededBy: o.supBy ? claimId(o.supBy) : null,
      status: o.status ?? "confirmed", sourceId: `s_${tok(rev)}`, note: `note ${tok(rev)} shared`,
    });
    return id;
  };
  for (const e of entIds) {
    addClaim(e, "name", e.n, { value: `name ${tok(e.n)} shared` });
    addClaim(e, "alias", Math.min(N, e.n + 2), { value: `alias ${tok(Math.min(N, e.n + 2))} shared` });
    if (e.kind === "location") {
      addClaim(e, "coordinates", e.n, { value: `${e.n}.5,${e.n}.25` });
    }
  }
  // Edges, role claims, retractions (suspicion at n superseded at n+3 by a truth claim).
  for (let i = 0; i + 1 < entIds.length; i += 2) {
    const a = entIds[i]!, b = entIds[i + 1]!;
    const rev = Math.max(a.n, b.n);
    addClaim(a, "knows", rev, { object: b.id });
    if (b.kind === "case") addClaim(a, "role_in_case", rev, { object: b.id, value: "witness" });
  }
  for (const e of entIds) {
    const supIn = Math.min(N, e.n + 3);
    if (supIn <= e.n) continue;
    // The belief below takes `cc`, so the truth claim right after it gets `cc + 1`.
    const truthId = `c_${tok(supIn)}_${cc + 1}`;
    addClaim(e, "trait", e.n, {
      value: `belief ${tok(e.n)} shared`, status: "in_show_suspicion", supIn, supBy: truthId,
    });
    addClaim(e, "trait", supIn, { value: `truth ${tok(supIn)} shared` });
  }
  // Pipeline-rule violation on purpose: claim revealed before its subject exists.
  addClaim(entIds[N * 3 - 1]!, "note", 1, { value: `early ${tok(1)} shared` });
  for (const e of entIds.filter((x) => x.kind === "arc")) {
    for (let k = 0; k < 3; k++) {
      const rev = Math.min(N, e.n + k);
      d.arcItems.push({
        arc: entityId(e.id), order: (k + 1) * 7, refClaim: null, refEntity: entityId(e.id),
        narrativeText: `narrative ${tok(rev)} shared`, revealedIn: rev,
      });
    }
  }
  for (let n = 1; n <= N; n++) {
    d.theories.push({
      id: theoryId(`t_${tok(n)}`), title: `theory ${tok(n)}`, body: `body ${tok(n)} shared`,
      sourceUrl: `https://example.invalid/${tok(n)}`, authorHandle: `h_${tok(n)}`, spoilsUpTo: n, tags: [`tag_${tok(n)}`, "shared"],
    });
  }
  // T1a: Spanish translations of every translatable text; the tokens follow the row they translate.
  d.translations = [];
  const trs = d.translations;
  for (const c of d.claims) {
    const n = Number(/CANARY_EP_(\d+)/.exec(c.id)![1]);
    if (c.value !== null && c.predicate !== "coordinates" && c.predicate !== "role_in_case") {
      trs.push({ targetId: c.id, field: "value", lang: "es", text: `traducido valor ${tok(n)} compartido` });
    }
    trs.push({ targetId: c.id, field: "note", lang: "es", text: `traducido nota ${tok(n)} compartida` });
  }
  for (const e of d.episodes) {
    trs.push({ targetId: episodeTargetId(e.epIndex), field: "title", lang: "es", text: `título PUBLIC_EP_${e.epIndex}` });
    trs.push({ targetId: episodeTargetId(e.epIndex), field: "synopsis", lang: "es", text: `sinopsis PUBLIC_EP_${e.epIndex}` });
  }
  for (const t of d.theories) {
    const n = t.spoilsUpTo;
    trs.push({ targetId: t.id, field: "title", lang: "es", text: `teoría ${tok(n)}` });
    trs.push({ targetId: t.id, field: "body", lang: "es", text: `cuerpo ${tok(n)} compartido` });
  }
  return d;
}

const data = canaryDataset();
const db = nodeDriver();
loadDataset(db, data);
const english = new KnowledgeEngine(db);
const spanish = inLanguage(english, "es");
let engine = english;

const maxToken = (text: string): number => {
  let m = 0;
  for (const x of text.matchAll(/CANARY_EP_(\d+)/g)) m = Math.max(m, Number(x[1]));
  return m;
};

/** Calls every public read query of the engine for p; returns {name, json}. */
function everything(pn: number, eng: KnowledgeEngine = english): Array<{ name: string; json: string }> {
  engine = eng;
  const p = progress(pn);
  const out: Array<{ name: string; json: string }> = [];
  const rec = (name: string, f: () => unknown) => {
    let v: unknown;
    try { v = f(); } catch (x) { v = { error: (x as Error).message }; }
    out.push({ name, json: JSON.stringify(v) });
  };
  rec("listEntities", () => engine.listEntities(p));
  for (const k of ENTITY_KINDS) rec(`listEntities:${k}`, () => engine.listEntities(p, k));
  rec("entityCounts", () => engine.entityCounts(p));
  rec("claimCount", () => engine.claimCount(p));
  rec("listClaims", () => engine.listClaims(p));
  rec("listEpisodes", () => engine.listEpisodes(p));
  rec("getGraph", () => engine.getGraph(p));
  rec("getMap", () => engine.getMap(p));
  rec("listTheories", () => engine.listTheories(p));
  rec("listTheories:shared", () => engine.listTheories(p, "shared"));
  for (const t of data.theories) rec("getTheory", () => engine.getTheory(p, t.id));
  for (const t of data.episodes) rec("getEpisode", () => engine.getEpisode(p, { season: t.season, number: t.number }));
  for (const q of ["canary", "shared", "name", "alias", "belief truth", "ep", "9", "CANARY_EP_12", "note early", "traducido", "valor", "nota compartida", "teoría", "cuerpo"]) {
    rec(`search:${q}`, () => engine.search(p, q, 1000));
  }
  for (const e of data.entities) {
    rec("getEntity", () => engine.getEntity(p, e.id));
    rec("listClaims:subject", () => engine.listClaims(p, { subject: e.id }));
    if (e.kind === "case") rec("getCaseFile", () => engine.getCaseFile(p, e.id));
    if (e.kind === "arc") rec("getArc", () => engine.getArc(p, e.id));
  }
  for (const c of data.claims) rec("getClaim", () => engine.getClaim(p, c.id));
  return out;
}

describe("S4 canary, Spanish engine (T1a: translations obey the same gating)", () => {
  it("the Spanish fixture really returns translated tokens above any p (the test can fail)", () => {
    const all = everything(N, spanish).filter((r) => /traducido|teoría|cuerpo/.test(r.json));
    expect(all.length).toBeGreaterThan(5);
    expect(Math.max(...all.map((r) => maxToken(r.json)))).toBe(N);
    expect(everything(N, english).some((r) => /traducido/.test(r.json))).toBe(false);
  });

  it("no public query in es returns a token with n > p, for any p (and peek p+1)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: N + 2 }), (pn) => {
        expect(everything(pn, spanish).filter((r) => maxToken(r.json) > pn).map((r) => r.name)).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });
});

describe("S4 canary (docs/design.md §6)", () => {
  it("the fixture really carries tokens above any p (the test can fail)", () => {
    const all = everything(N).map((r) => maxToken(r.json));
    expect(Math.max(...all)).toBe(N);
    expect(everything(0).filter((r) => maxToken(r.json) > 0)).toEqual([]);
  });

  it("every retraction in the fixture points at a real truth claim", () => {
    const ids = new Set(data.claims.map((c) => c.id));
    const retractions = data.claims.filter((c) => c.supersededBy !== null);
    expect(retractions.length).toBeGreaterThan(0);
    expect(retractions.filter((c) => !ids.has(c.supersededBy!))).toEqual([]);
  });

  it("exercises the visible-replacement path at full progress", () => {
    const replaced = engine
      .listClaims(progress(N), { predicate: "trait" })
      .filter((c) => c.supersession?.replacedBy);
    expect(replaced.length).toBeGreaterThan(0);
  });

  it("no public query returns a token with n > p, for any p", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: N + 2 }), (pn) => {
        const leaks = everything(pn).filter((r) => maxToken(r.json) > pn).map((r) => r.name);
        expect(leaks).toEqual([]);
      }),
      { numRuns: 200 },
    );
  });

  it("peek (p+1) shows at most tokens <= p+1", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: N }), (pn) => {
        expect(everything(pn + 1).filter((r) => maxToken(r.json) > pn + 1)).toEqual([]);
      }),
    );
  });
});
