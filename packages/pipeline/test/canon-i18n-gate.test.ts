import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  InvalidInputError, KnowledgeEngine, inLanguage, loadDataset, peek, resolveProgress, type SqlDriver,
} from "@mentalist/core";
import { compile, loadDir } from "../src/index.ts";
import { opaque } from "../src/compile.ts";

// Real canon with its Spanish translations, counts only: never print canon text.
// Uses only the public core API; hidden items are derived from the compiled dataset, not raw SQL.
const dir = fileURLToPath(new URL("../../../data/canon/", import.meta.url));
const { docs, i18n } = loadDir(dir);
const data = compile(docs, i18n);
const raw = new DatabaseSync(":memory:");
const db: SqlDriver = {
  all: (s, p = []) => raw.prepare(s).all(...(p as never[])) as never,
  get: (s, p = []) => raw.prepare(s).get(...(p as never[])) as never,
  exec: (s, p) => (p?.length ? raw.prepare(s).run(...(p as never[])) : raw.exec(s)) as never,
};
loadDataset(db, data);
const es = inLanguage(new KnowledgeEngine(db), "es");
const tok = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const claimReveal = new Map(data.claims.map((c) => [c.id as string, c.revealedIn]));
const theoryReveal = new Map(data.theories.map((t) => [t.id as string, t.spoilsUpTo]));
const spanish = (data.translations ?? []).filter((t) => t.lang === "es");
const points = [[1, 1], [3, 1], [6, 12]].map(([s, e]) => resolveProgress(db, { season: s!, episode: e! }));

describe("real canon: Spanish translations stay gated", () => {
  for (const p of [...points, peek(points[2]!)]) {
    it(`p=${p.epIndex}: words of hidden Spanish translations never match hidden claims`, () => {
      const hiddenReveal = (id: string) => (claimReveal.get(id) ?? theoryReveal.get(id) ?? 0) > p.epIndex;
      const words = new Set<string>();
      for (const t of spanish) if (hiddenReveal(t.targetId)) tok(t.text).forEach((w) => words.add(w));
      expect(words.size).toBeGreaterThan(0);
      let bad = 0;
      for (const w of words) {
        for (const h of es.search(p, w, 1000).hits) if ((claimReveal.get(h.claimId) ?? Infinity) > p.epIndex) bad++;
      }
      expect(bad).toBe(0);
      expect(es.listClaims(p).every((c) => c.revealedIn <= p.epIndex)).toBe(true);
    });
  }

  it("Red John has no actor claim; actor values are never translated", () => {
    const redJohn = opaque("e", "p-red-john");
    expect(data.claims.filter((c) => c.subject === redJohn && c.predicate === "actor").length).toBe(0);
    const actorClaims = new Set(data.claims.filter((c) => c.predicate === "actor").map((c) => c.id as string));
    expect(spanish.filter((t) => actorClaims.has(t.targetId)).length).toBe(0);
  });

  it("language codes are validated before they reach SQL", () => {
    const en = new KnowledgeEngine(db);
    for (const v of ["es' OR '1'='1", "es');DROP TABLE claim;--", "", "e", "es MX", 42]) {
      expect(() => inLanguage(en, v as string)).toThrow(InvalidInputError);
    }
    expect(inLanguage(en, "es-MX").lang).toBe("es");
  });
});
