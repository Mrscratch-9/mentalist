import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

// Checks the real canon by counts only: it must never print canon text (spoilers).
const dir = fileURLToPath(new URL("../../../data/canon/", import.meta.url));
const docs = readdirSync(dir)
  .filter((f) => /^episodes-s\d+\.yaml$/.test(f))
  .sort()
  .map((f) => ({ f, d: parse(readFileSync(dir + f, "utf8")) }));

type Ep = { code: string; title?: string; synopsis?: string; details?: string };
type Src = { kind: string; url?: string; episode?: string };

describe("real canon (counts only)", () => {
  it("has 151 episodes, 23/23/24/24/22/22/13, with consecutive codes", () => {
    const per = docs.map(({ f, d }) => {
      const s = Number(/s(\d+)/.exec(f)![1]);
      const bad = (d.episodes as Ep[]).filter((e, i) => e.code !== `S${s}E${i + 1}`).length;
      expect(bad).toBe(0);
      return d.episodes.length;
    });
    expect(per).toEqual([23, 23, 24, 24, 22, 22, 13]);
  });

  it("has exactly one https episode source per episode", () => {
    for (const { d } of docs) {
      const n = new Map<string, number>();
      for (const src of d.sources as Src[]) {
        expect(src.kind).toBe("episode");
        expect(String(src.url)).toMatch(/^https:\/\//);
        n.set(String(src.episode), (n.get(String(src.episode)) ?? 0) + 1);
      }
      expect((d.episodes as Ep[]).filter((e) => n.get(e.code) !== 1).length).toBe(0);
      expect(n.size).toBe(d.episodes.length);
    }
  });

  it("keeps synopses short (≤ 200 chars, ≤ 2 sentences), titles set, details empty", () => {
    let violations = 0;
    for (const { d } of docs) {
      for (const e of d.episodes as Ep[]) {
        const s = String(e.synopsis ?? "").trim();
        const sentences = s.split(/(?<=[.!?])["')\]]*\s+(?=\S)/).filter(Boolean).length;
        if (!s || s.length > 200 || sentences > 2 || !String(e.title ?? "").trim() || (e.details ?? "") !== "") violations++;
      }
    }
    expect(violations).toBe(0);
  });

  // Entity/claim files: core.yaml plus cases-s*.yaml (counts only, never text).
  type Cl = { subject: string; predicate: string; revealed: string; source: string; note?: string };
  type En = { key: string; kind: string };
  const files = readdirSync(dir).filter((f) => f.endsWith(".yaml") && !f.startsWith("episodes-")).sort();
  const canon = files.map((f) => {
    const d = parse(readFileSync(dir + f, "utf8"));
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
    type WikiSrc = { key: string; kind: string; episode?: string; url?: string };
    const wiki = files
      .flatMap((f) => (parse(readFileSync(dir + f, "utf8")).sources ?? []) as WikiSrc[])
      .filter((s) => s.key.startsWith("src-wiki-"));
    const violations = wiki.filter(
      (s) =>
        s.kind !== "wiki" ||
        s.key !== `src-wiki-${String(s.episode).toLowerCase()}` ||
        !/^https:\/\/thementalist\.fandom\.com\//.test(String(s.url)),
    ).length;
    expect(violations).toBe(0);
  });

  it("recurring characters are defined only in core.yaml", () => {
    const core = new Set(canon.find((c) => c.f === "core.yaml")!.entities.map((e) => e.key));
    const violations = allClaims.filter((c) => c.predicate === "recurring" && !core.has(c.subject)).length;
    expect(violations).toBe(0);
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
    expect(new Set(cases.map((e) => e.introduced)).size).toBe(cases.length);
    expect(cases.filter((e) => !named.has(e.key) || !described.has(e.key)).length).toBe(0);
  });
});

describe("real canon references (counts only)", () => {
  const all = (k: string) =>
    readdirSync(dir)
      .filter((f) => f.endsWith(".yaml"))
      .flatMap((f) => (parse(readFileSync(dir + f, "utf8"))?.[k] ?? []) as Array<Record<string, string>>);

  it("every claim reference resolves; no orphan person or wiki source", () => {
    const ents = new Set(all("entities").map((e) => e["key"]));
    const srcs = new Set(all("sources").map((s) => s["key"]));
    const claims = all("claims");
    expect(claims.filter((c) => !ents.has(c["subject"]!) || (c["object"] && !ents.has(c["object"])) || !srcs.has(c["source"]!)).length).toBe(0);
    const used = new Set(claims.flatMap((c) => [c["subject"], c["object"], c["source"]]));
    expect(all("entities").filter((e) => e["kind"] === "person" && !used.has(e["key"])).length).toBe(0);
    expect(all("sources").filter((s) => s["kind"] === "wiki" && !used.has(s["key"])).length).toBe(0);
  });
});
