import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  KnowledgeEngine, loadDataset, peek, resolveProgress,
  type Dataset, type EntityId, type Progress, type SqlDriver,
} from "@mentalist/core";
import { compile, loadDir, validate } from "../src/index.ts";
import { nodeDriver } from "../src/driver.ts";

// Spoiler gating of the REAL canon at the owner's progress (S6E12), by counts only.
// Assertions compare numbers/booleans; no canon text is ever part of a failure message.
const dir = fileURLToPath(new URL("../../../data/canon/", import.meta.url));

let data: Dataset;
let raw: DatabaseSync;
let db: SqlDriver;
let engine: KnowledgeEngine;
let p: Progress;
let q: Progress;

const entIntro = new Map<string, number>();
const claimRev = new Map<string, number>();

beforeAll(() => {
  const { docs, i18n, errors: loadErrors } = loadDir(dir);
  expect(loadErrors.length).toBe(0);
  expect(validate(docs, i18n).length).toBe(0);
  data = compile(docs, i18n);
  raw = new DatabaseSync(":memory:");
  db = nodeDriver(raw);
  loadDataset(db, data);
  engine = new KnowledgeEngine(db);
  p = resolveProgress(db, { season: 6, episode: 12 });
  q = peek(p);
  for (const e of data.entities) entIntro.set(e.id, e.introducedIn);
  for (const c of data.claims) claimRev.set(c.id, c.revealedIn);
});

afterAll(() => raw?.close());

describe("real canon gating at S6E12 (counts only)", () => {
  it("resolves S6E12 to the 128th episode and peek to the next one", () => {
    expect(p.epIndex).toBe(128);
    expect(q.epIndex).toBe(129);
    expect(data.episodes.length).toBe(151);
  });

  it("lists no entity introduced after p", () => {
    const all = engine.listEntities(p);
    expect(all.length).toBeGreaterThan(0);
    expect(all.filter((e) => e.introducedIn > p.epIndex || (entIntro.get(e.id) ?? Infinity) > p.epIndex).length).toBe(0);
    expect(all.length).toBe([...entIntro.values()].filter((i) => i <= p.epIndex).length);
  });

  it("lists no claim revealed after p, nor one whose subject or object is hidden", () => {
    const claims = engine.listClaims(p);
    expect(claims.length).toBeGreaterThan(0);
    expect(claims.filter((c) => c.revealedIn > p.epIndex || (claimRev.get(c.id) ?? Infinity) > p.epIndex).length).toBe(0);
    const hidden = (id: string | null) => id !== null && (entIntro.get(id) ?? Infinity) > p.epIndex;
    expect(claims.filter((c) => hidden(c.subject) || hidden(c.object)).length).toBe(0);
    expect(engine.claimCount(p)).toBe(claims.length);
  });

  it("builds the graph only from items at or before p", () => {
    const g = engine.getGraph(p);
    expect(g.edges.length).toBeGreaterThan(0);
    expect(g.edges.filter((e) => (claimRev.get(e.claimId) ?? Infinity) > p.epIndex).length).toBe(0);
    expect(g.edges.filter((e) => (entIntro.get(e.from) ?? Infinity) > p.epIndex || (entIntro.get(e.to) ?? Infinity) > p.epIndex).length).toBe(0);
    expect(g.nodes.filter((n) => (entIntro.get(n.id) ?? Infinity) > p.epIndex).length).toBe(0);
  });

  it("places map pins only from items at or before p", () => {
    const m = engine.getMap(p);
    expect(m.pins.length).toBeGreaterThan(0);
    expect(m.pins.filter((x) => (claimRev.get(x.claimId) ?? Infinity) > p.epIndex || (entIntro.get(x.entityId) ?? Infinity) > p.epIndex).length).toBe(0);
  });

  it("exposes case-file roles only from items at or before p, for every visible case", () => {
    const cases = engine.listEntities(p, "case");
    let roles = 0;
    let bad = 0;
    for (const c of cases) {
      const file = engine.getCaseFile(p, c.id);
      for (const r of file.roles) {
        roles++;
        if (r.revealedIn > p.epIndex || (claimRev.get(r.claimId) ?? Infinity) > p.epIndex || (entIntro.get(r.person) ?? Infinity) > p.epIndex) bad++;
      }
      bad += file.claims.filter((x) => x.revealedIn > p.epIndex).length;
    }
    expect(roles).toBeGreaterThan(0);
    expect(bad).toBe(0);
  });

  it("returns search hits only from items at or before p", () => {
    // Query words are taken from hidden claims at run time, so hidden text is probed without being written down.
    const hiddenWords = new Set<string>();
    for (const c of data.claims) {
      if (c.revealedIn <= p.epIndex || !c.value) continue;
      for (const w of c.value.split(/[^\p{L}\p{N}]+/u)) if (w.length > 3) hiddenWords.add(w);
      if (hiddenWords.size >= 400) break;
    }
    const queries = [...hiddenWords, "perpetrator", "name", "case", "the"];
    let hits = 0;
    let bad = 0;
    for (const w of queries) {
      const r = engine.search(p, w, 1000);
      hits += r.hits.length;
      for (const h of r.hits) {
        if ((claimRev.get(h.claimId) ?? Infinity) > p.epIndex || (entIntro.get(h.subject) ?? Infinity) > p.epIndex) bad++;
      }
      expect(r.total).toBeGreaterThanOrEqual(r.hits.length);
    }
    expect(hits).toBeGreaterThan(0);
    expect(bad).toBe(0);
  });

  it("exposes unwatched episodes only as season, number, title, synopsis (+ watched)", () => {
    const eps = engine.listEpisodes(p);
    expect(eps.length).toBe(151);
    const unwatched = eps.filter((e) => !e.watched);
    const watched = eps.filter((e) => e.watched);
    expect(watched.length).toBe(p.epIndex);
    expect(unwatched.length).toBe(151 - p.epIndex);
    const shape = unwatched.filter((e) => Object.keys(e).sort().join() !== "number,season,synopsis,synopsisLang,title,titleLang,watched").length;
    expect(shape).toBe(0);
    // Watched episodes carry their details; unwatched ones carry no details field at all.
    expect(unwatched.filter((e) => "details" in e || "epIndex" in e).length).toBe(0);
    expect(watched.filter((e) => !("details" in e)).length).toBe(0);
  });

  it("shows 128 cases at S6E12 (one case per watched episode)", () => {
    expect(engine.listEntities(p, "case").length).toBe(128);
    expect(engine.entityCounts(p).case).toBe(128);
  });

  it("keeps the curated case layer after the import: ≥103 confirmed-solved cases, recurring persons and fan items visible at S6E12", () => {
    const solved = engine.listEntities(p, "case").filter((c) =>
      engine.getCaseFile(p, c.id).roles.some((r) => r.state === "current" && r.role === "perpetrator" && r.status === "confirmed"),
    ).length;
    expect(solved).toBeGreaterThanOrEqual(103);
    const persons = new Set(data.entities.filter((e) => e.kind === "person").map((e) => e.id as string));
    const recurring = engine.listClaims(p, { predicate: "recurring" }).filter((c) => c.value === "true" && persons.has(c.subject as string));
    const visible = new Set(engine.listEntities(p, "person").map((e) => e.id as string));
    expect(recurring.length).toBeGreaterThan(0);
    expect(recurring.filter((c) => !visible.has(c.subject as string)).length).toBe(0);
    const theories = engine.listTheories(p);
    expect(theories.length).toBeGreaterThan(0);
    expect(theories.filter((t) => t.spoilsUpTo > p.epIndex).length).toBe(0);
    expect(data.theories.length).toBeGreaterThan(theories.length);
  });

  it("peek adds exactly the entities introduced at p+1", () => {
    const before = new Set<EntityId>(engine.listEntities(p).map((e) => e.id));
    const after = engine.listEntities(q);
    const added = after.filter((e) => !before.has(e.id));
    const expected = data.entities.filter((e) => e.introducedIn === q.epIndex);
    expect(expected.length).toBeGreaterThan(0);
    expect(added.length).toBe(expected.length);
    expect(added.filter((e) => e.introducedIn !== q.epIndex).length).toBe(0);
    expect(new Set(added.map((e) => e.id))).toEqual(new Set(expected.map((e) => e.id)));
    expect(after.length).toBe(before.size + expected.length);
    // Nothing is lost by peeking, and nothing past p+1 appears.
    expect(after.filter((e) => e.introducedIn > q.epIndex).length).toBe(0);
    expect(engine.claimCount(q)).toBeGreaterThanOrEqual(engine.claimCount(p));
    expect(engine.listClaims(q).filter((c) => c.revealedIn > q.epIndex).length).toBe(0);
  });

  it("does not mutate the progress value when peeking", () => {
    expect(p.epIndex).toBe(128);
    expect(engine.listEntities(p).length).toBe(engine.listEntities(p).length);
    expect(engine.listEpisodes(q).filter((e) => e.watched).length).toBe(q.epIndex);
  });
});

describe("fan theories at S6E12 do not name later episodes (counts only)", () => {
  it("no visible theory body contains a later episode title (len > 4) or a later season/episode code", () => {
    const norm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
    const later = data.episodes.filter((e) => e.epIndex > p.epIndex);
    const seasonOf = new Map<number, number>();
    for (const e of data.episodes) seasonOf.set(e.season, Math.max(seasonOf.get(e.season) ?? 0, e.epIndex));
    const idx = (s: number, n: number) => data.episodes.find((e) => e.season === s && e.number === n)?.epIndex ?? Infinity;
    const titles = later.map((e) => norm(e.title)).filter((t) => t.trim().length > 4);
    const ordinals: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7 };
    let visible = 0;
    let bad = 0;
    for (const t of engine.listTheories(p)) {
      visible++;
      const text = `${t.title} ${t.body}`;
      const n = norm(text);
      let leak = titles.some((x) => n.includes(x));
      const check = (s: number, e: number | null) => {
        const i = e === null ? (seasonOf.get(s) ?? Infinity) : idx(s, e);
        if (i > p.epIndex) leak = true;
      };
      for (const m of text.matchAll(/season[^0-9]{0,4}(\d+)[^0-9]{0,4}episode[^0-9]{0,4}(\d+)/gi)) check(Number(m[1]), Number(m[2]));
      for (const m of text.matchAll(/episode[^0-9]{0,4}(\d+)\s+of\s+(?:the\s+)?season[^0-9]{0,4}(\d+)/gi)) check(Number(m[2]), Number(m[1]));
      for (const m of text.matchAll(/\bS(\d+)E(\d+)\b|\b(\d+)x(\d+)\b/gi)) check(Number(m[1] ?? m[3]), Number(m[2] ?? m[4]));
      for (const m of text.matchAll(/\bseason[^0-9]{0,4}(\d+)/gi)) check(Number(m[1]), null);
      for (const m of text.matchAll(/\b(\d+)(?:st|nd|rd|th)\s+season/gi)) check(Number(m[1]), null);
      for (const m of text.matchAll(/\b(first|second|third|fourth|fifth|sixth|seventh)\s+season/gi)) check(ordinals[m[1]!.toLowerCase()]!, null);
      if (leak) bad++;
    }
    expect(visible).toBeGreaterThan(0);
    expect(bad).toBe(0);
  });
});
