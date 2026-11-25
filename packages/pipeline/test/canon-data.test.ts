import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

// Checks the real canon by counts only: it must never print canon text (spoilers).
const dir = fileURLToPath(new URL("../../../data/canon/", import.meta.url));

// Every canon file, recursively (core, cases-s*, generated/*), sorted by relative path.
const walk = (rel = ""): string[] =>
  readdirSync(dir + rel, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(rel + e.name + "/") : /\.ya?ml$/i.test(e.name) ? [rel + e.name] : []))
    .sort();
const read = (f: string) => (parse(readFileSync(dir + f, "utf8")) ?? {}) as Record<string, unknown[] | undefined>;

type Ep = { code: string; title?: string; synopsis?: string; details?: string };
type Src = { key: string; kind: string; url?: string; episode?: string };
type Cl = { key: string; subject: string; predicate: string; revealed: string; source: string; note?: string };
type En = { key: string; kind: string };

// Episodes and episode sources come from the importer only.
const gen = read("generated/episodes.yaml");

describe("real canon (counts only)", () => {
  it("has no hand-authored episodes (they come only from generated/episodes.yaml)", () => {
    expect(walk().filter((f) => (read(f).episodes?.length ?? 0) > 0)).toEqual(["generated/episodes.yaml"]);
  });

  it("has 151 episodes, 23/23/24/24/22/22/13, with consecutive codes", () => {
    const eps = gen.episodes as Ep[];
    expect(eps.length).toBe(151);
    const per = new Map<number, number>();
    let bad = 0;
    for (const e of eps) {
      const m = /^S(\d+)E(\d+)$/.exec(e.code)!;
      const s = Number(m[1]);
      per.set(s, (per.get(s) ?? 0) + 1);
      if (Number(m[2]) !== per.get(s)) bad++;
    }
    expect(bad).toBe(0);
    expect([...per.entries()].sort((x, y) => x[0] - y[0]).map(([, n]) => n)).toEqual([23, 23, 24, 24, 22, 22, 13]);
  });

  it("has exactly one https episode source per episode", () => {
    const n = new Map<string, number>();
    for (const src of (gen.sources as Src[]).filter((x) => x.kind === "episode")) {
      expect(String(src.url)).toMatch(/^https:\/\//);
      expect(src.key).toBe(`src-${String(src.episode).toLowerCase()}`);
      n.set(String(src.episode), (n.get(String(src.episode)) ?? 0) + 1);
    }
    const eps = gen.episodes as Ep[];
    expect(eps.filter((e) => n.get(e.code) !== 1).length).toBe(0);
    expect(n.size).toBe(eps.length);
  });

  it("has a title and a synopsis for every episode, details empty", () => {
    const violations = (gen.episodes as Ep[]).filter(
      (e) => !String(e.synopsis ?? "").trim() || !String(e.title ?? "").trim() || (e.details ?? "") !== "",
    ).length;
    expect(violations).toBe(0);
  });

  // Entity/claim files: core.yaml, cases-s*.yaml and generated/* (counts only, never text).
  const files = walk();
  const canon = files.map((f) => {
    const d = read(f);
    return { f, entities: (d.entities ?? []) as En[], claims: (d.claims ?? []) as Cl[] };
  });
  const allClaims = canon.flatMap((c) => c.claims);
  const kindOf = new Map(canon.flatMap((c) => c.entities).map((e) => [e.key, e.kind]));

  it("every claim cites the episode or wiki source of its own reveal episode", () => {
    const violations = allClaims.filter((c) => {
      const ep = String(c.revealed).toLowerCase();
      return c.source !== `src-${ep}` && c.source !== `src-wiki-${ep}`;
    }).length;
    expect(violations).toBe(0);
  });

  it("wiki sources are Fandom pages tied to their episode", () => {
    const wiki = files.flatMap((f) => (read(f).sources ?? []) as Src[]).filter((s) => s.key.startsWith("src-wiki-"));
    expect(wiki.length).toBe(151);
    const violations = wiki.filter(
      (s) =>
        s.kind !== "wiki" ||
        s.key !== `src-wiki-${String(s.episode).toLowerCase()}` ||
        !/^https:\/\/thementalist\.fandom\.com\//.test(String(s.url)),
    ).length;
    expect(violations).toBe(0);
  });

  it("recurring characters are defined only in generated/characters.yaml or core.yaml", () => {
    const allowed = new Set(
      canon.filter((c) => c.f === "core.yaml" || c.f === "generated/characters.yaml").flatMap((c) => c.entities.map((e) => e.key)),
    );
    const recurring = allClaims.filter((c) => c.predicate === "recurring");
    expect(recurring.length).toBeGreaterThan(0);
    expect(recurring.filter((c) => !allowed.has(c.subject)).length).toBe(0);
  });

  it("every location coordinates claim notes city-level or landmark", () => {
    const violations = allClaims.filter(
      (c) => c.predicate === "coordinates" && kindOf.get(c.subject) === "location" && !["city-level", "landmark"].includes(c.note ?? ""),
    ).length;
    expect(violations).toBe(0);
  });

  it("red_john_smiley subjects are locations linked to a case", () => {
    const linked = new Set(allClaims.filter((c) => c.predicate === "part_of_case").map((c) => c.subject));
    const violations = allClaims.filter(
      (c) => c.predicate === "red_john_smiley" && (kindOf.get(c.subject) !== "location" || !linked.has(c.subject)),
    ).length;
    expect(violations).toBe(0);
  });

  it("coordinates parse as lat,lon within range", () => {
    const violations = allClaims.filter((c) => {
      if (c.predicate !== "coordinates") return false;
      const [lat, lon] = String((c as Cl & { value?: string }).value).split(",").map(Number);
      return !(Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat!) <= 90 && Math.abs(lon!) <= 180);
    }).length;
    expect(violations).toBe(0);
  });

  it("has one named and described case per authored episode", () => {
    const cases = canon.flatMap((c) => c.entities).filter((e) => e.kind === "case") as Array<En & { introduced: string }>;
    const has = (p: string) => new Set(allClaims.filter((c) => c.predicate === p).map((c) => c.subject));
    const named = has("name");
    const described = has("description");
    expect(cases.length).toBe(151);
    expect(new Set(cases.map((e) => e.introduced)).size).toBe(cases.length);
    expect(cases.filter((e) => !named.has(e.key) || !described.has(e.key)).length).toBe(0);
  });

  it("keeps no hand-authored person whose name and first episode equal an imported person", () => {
    const norm = (v: unknown) => String(v).toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, " ").trim();
    const sig = (cs: typeof canon) => {
      const intro = new Map(cs.flatMap((c) => c.entities).filter((e) => e.kind === "person").map((e) => [e.key, (e as En & { introduced: string }).introduced]));
      return cs.flatMap((c) => c.claims).filter((c) => c.predicate === "name" && intro.has(c.subject))
        .map((c) => `${intro.get(c.subject)}|${norm((c as Cl & { value?: string }).value)}`);
    };
    const imported = new Set(sig(canon.filter((c) => c.f === "generated/characters.yaml")));
    expect(sig(canon.filter((c) => !c.f.startsWith("generated/"))).filter((x) => imported.has(x)).length).toBe(0);
  });
});

describe("real canon references (counts only)", () => {
  const all = (k: string) => walk().flatMap((f) => (read(f)[k] ?? []) as Array<Record<string, string>>);

  it("defines every entity, source and claim key exactly once across all files", () => {
    for (const k of ["entities", "sources", "claims"]) {
      const keys = all(k).map((x) => x["key"]);
      expect(keys.length - new Set(keys).size).toBe(0);
    }
  });

  it("every claim reference resolves; no orphan person or wiki source", () => {
    const ents = new Set(all("entities").map((e) => e["key"]));
    const srcs = new Set(all("sources").map((s) => s["key"]));
    const claims = all("claims");
    expect(claims.filter((c) => !ents.has(c["subject"]!) || (c["object"] && !ents.has(c["object"])) || !srcs.has(c["source"]!)).length).toBe(0);
    const used = new Set(claims.flatMap((c) => [c["subject"], c["object"], c["source"]]));
    expect(all("entities").filter((e) => e["kind"] === "person" && !used.has(e["key"])).length).toBe(0);
    // Hand-authored sources must be used; generated/ defines one wiki source per episode, some of which no claim cites.
    const handSources = walk().filter((f) => !f.startsWith("generated/")).flatMap((f) => (read(f)["sources"] ?? []) as Array<Record<string, string>>);
    expect(handSources.filter((s) => s["kind"] === "wiki" && !used.has(s["key"])).length).toBe(0);
  });
});
