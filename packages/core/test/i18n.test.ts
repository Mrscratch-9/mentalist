import { describe, expect, it } from "vitest";
import {
  InvalidInputError, KnowledgeEngine, NotFoundError, claimId, entityId, inLanguage, progress, theoryId,
  type Translation,
} from "../src/index.ts";
import { dbWith } from "./helpers.ts";
import { ID, tiny } from "./fixture.ts";

const tr = (targetId: string, field: Translation["field"], text: string): Translation => ({
  targetId, field, lang: "es", text,
});
const withTr = (translations: Translation[]) => {
  const e = new KnowledgeEngine(dbWith({ ...tiny(), translations }));
  return { en: e, es: inLanguage(e, "es") };
};
const P = progress;

const T = [
  tr("c_name_bram", "value", "ES_bram_name"), // visible from ep 4
  tr("c_truth", "value", "ES_truth_lampara"), // revealed ep 4
  tr("c_fut_org", "value", "ES_zorvane_circulo"), // revealed ep 5
  tr("c_susp", "note", "ES_unused"), // note is "" in English: still applied when present
  tr("1", "title", "ES_titulo_1"),
  tr("5", "title", "ES_titulo_5"),
  tr("5", "synopsis", "ES_sinopsis_5"),
  tr("t_b2", "title", "ES_teoria_tarde"),
  tr("t_b2", "body", "ES_cuerpo_tarde"),
];

describe("T1a translations: language and fallback", () => {
  it("defaults to English and flags every text as en", () => {
    const { en } = withTr(T);
    const c = en.getClaim(P(6), claimId("c_truth"));
    expect(c.value).toBe("Dara never owned a lantern");
    expect(c.valueLang).toBe("en");
    expect(c.noteLang).toBe("en");
    expect(en.lang).toBe("en");
    const e = en.getEpisode(P(6), { season: 1, number: 1 });
    expect(e.title).toBe("Title 1");
    expect(e.titleLang).toBe("en");
  });

  it("returns the translation with its language flag, English elsewhere", () => {
    const { es } = withTr(T);
    expect(es.lang).toBe("es");
    const c = es.getClaim(P(6), claimId("c_truth"));
    expect([c.value, c.valueLang]).toEqual(["ES_truth_lampara", "es"]);
    const other = es.getClaim(P(6), claimId("c_name_orla"));
    expect([other.value, other.valueLang]).toEqual(["Orla Vint", "en"]);
    const listed = es.listClaims(P(6)).find((x) => x.id === "c_name_bram")!;
    expect(listed.value).toBe("ES_bram_name");
    const detail = es.getEntity(P(6), entityId(ID.bram));
    expect(detail.claims.find((x) => x.predicate === "name")!.valueLang).toBe("es");
    expect(es.getClaim(P(6), claimId("c_susp")).noteLang).toBe("es");
  });

  it("episodes: translated title/synopsis even when unwatched; details stay English and gated", () => {
    const { es } = withTr(T);
    const unwatched = es.getEpisode(P(1), { season: 2, number: 2 });
    expect(unwatched).toMatchObject({ title: "ES_titulo_5", synopsis: "ES_sinopsis_5", titleLang: "es", synopsisLang: "es", watched: false });
    expect("details" in unwatched).toBe(false);
    const list = es.listEpisodes(P(1));
    expect(list[0]).toMatchObject({ title: "ES_titulo_1", titleLang: "es", synopsisLang: "en", synopsis: "Synopsis 1" });
    expect(list[1]).toMatchObject({ title: "Title 2", titleLang: "en" });
    const watched = es.getEpisode(P(5), { season: 2, number: 2 });
    expect(watched.watched && watched.details).toBe("Details 5");
  });

  it("theories: translated title/body, gated by spoils_up_to", () => {
    const { es } = withTr(T);
    expect(es.listTheories(P(5)).map((t) => t.id)).toEqual(["t_a1"]);
    expect(() => es.getTheory(P(5), theoryId("t_b2"))).toThrow(NotFoundError);
    const t = es.getTheory(P(6), theoryId("t_b2"));
    expect(t).toMatchObject({ title: "ES_teoria_tarde", body: "ES_cuerpo_tarde", titleLang: "es", bodyLang: "es" });
    expect(es.getTheory(P(6), theoryId("t_a1"))).toMatchObject({ title: "Early theory", titleLang: "en" });
  });

  it("gating is unchanged: translations of hidden items are never returned", () => {
    const { es } = withTr(T);
    const p = P(3);
    const json = JSON.stringify([
      es.listClaims(p), es.listEntities(p), es.getGraph(p), es.search(p, "ES_truth_lampara"), es.search(p, "zorvane"),
      es.search(p, "ES_zorvane_circulo"), es.listTheories(p),
    ]);
    expect(json).not.toContain("lampara");
    expect(json).not.toContain("ES_zorvane_circulo");
    expect(json).not.toContain("ES_bram_name");
    expect(() => es.getClaim(p, claimId("c_truth"))).toThrow(NotFoundError);
    const err = (f: () => unknown) => { try { f(); } catch (x) { return (x as Error).message; } return ""; };
    expect(err(() => es.getClaim(p, claimId("c_truth")))).toBe(err(() => es.getClaim(p, claimId("c_nope"))));
  });

  it("rejects a malformed language and normalizes region tags", () => {
    const e = new KnowledgeEngine(dbWith(tiny()));
    for (const bad of ["", "e", "es'--", "x y", "español", 3 as never]) {
      expect(() => inLanguage(e, bad)).toThrow(InvalidInputError);
    }
    expect(inLanguage(e, "es-MX").lang).toBe("es");
    expect(inLanguage(e, "en")).toBe(e);
    expect(inLanguage(e, "EN").lang).toBe("en");
  });
});

describe("T1a translations: search", () => {
  it("matches translated text in the requested language only, in the same visibility filter", () => {
    const { en, es } = withTr(T);
    const p = P(6);
    const hit = es.search(p, "ES_truth_lampara");
    expect(hit.total).toBe(1);
    expect(hit.hits[0]).toMatchObject({ claimId: "c_truth", lang: "es" });
    expect(hit.hits[0]!.snippet).toContain("lampara");
    expect(en.search(p, "ES_truth_lampara")).toEqual({ total: 0, hits: [] });
    // English text still matches in Spanish mode (and is not double-counted)
    const eng = es.search(p, "lantern");
    expect(eng.hits.map((h) => h.claimId)).toContain("c_susp");
    expect(new Set(eng.hits.map((h) => h.claimId)).size).toBe(eng.hits.length);
    expect(es.search(p, "ES_zorvane_circulo").total).toBe(1);
    expect(es.search(P(4), "ES_zorvane_circulo")).toEqual({ total: 0, hits: [] });
    expect(en.search(p, "lantern").hits[0]!.lang).toBe("en");
  });
});
