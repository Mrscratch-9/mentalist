import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

// Spoiler guard for imported characters, by counts only: it must never print canon text.
const dir = fileURLToPath(new URL("../../../data/canon/", import.meta.url));
const walk = (rel = ""): string[] =>
  readdirSync(dir + rel, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(rel + e.name + "/") : /\.ya?ml$/i.test(e.name) ? [rel + e.name] : []))
    .sort();
const read = (f: string) => (parse(readFileSync(dir + f, "utf8")) ?? {}) as Record<string, unknown[] | undefined>;

type Cl = { subject: string; predicate: string; value?: string; revealed: string; source: string; note?: string };
type En = { key: string; kind: string; introduced: string };

const gen = read("generated/characters.yaml");
const core = read("core.yaml");
const persons = (gen.entities as En[]).filter((e) => e.kind === "person");
const personKeys = new Set(persons.map((x) => x.key));
const genClaims = gen.claims as Cl[];
const coreClaims = (core.claims ?? []) as Cl[];
const order = (c: string): number => {
  const m = /^S(\d+)E(\d+)$/.exec(c)!;
  return Number(m[1]) * 1000 + Number(m[2]);
};
const pageTitleName = (note: string): string =>
  decodeURIComponent(note.split("/wiki/")[1]!.split("?")[0]!)
    .replace(/_/g, " ")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim();

describe("imported characters (counts only)", () => {
  it("has no markup sequence in any string of any canon file", () => {
    const bad = /<|\{\{|\[\[|''|mw-/;
    let n = 0;
    const visit = (v: unknown): void => {
      if (typeof v === "string") n += bad.test(v) ? 1 : 0;
      else if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v === "object") Object.values(v).forEach(visit);
    };
    for (const f of walk()) visit(read(f));
    expect(n).toBe(0);
  });

  it("every imported person's name claim equals its page-title-derived name", () => {
    const names = genClaims.filter((c) => c.predicate === "name" && personKeys.has(c.subject));
    expect(names.length).toBe(persons.length);
    expect(names.filter((c) => c.value !== pageTitleName(c.note ?? "")).length).toBe(0);
  });

  it("no imported person has a generated role claim; roles come only from curated core claims", () => {
    expect(genClaims.filter((c) => c.predicate === "role").length).toBe(0);
    const roles = coreClaims.filter((c) => c.predicate === "role");
    expect(roles.length).toBeGreaterThan(0);
    expect(roles.filter((c) => !personKeys.has(c.subject)).length).toBe(0);
  });

  it("curated roles are sourced and never revealed before the person's introduction", () => {
    const intro = new Map(persons.map((x) => [x.key, x.introduced]));
    const roles = coreClaims.filter((c) => c.predicate === "role");
    expect(roles.filter((c) => !c.source || order(c.revealed) < order(intro.get(c.subject) ?? "S99E99")).length).toBe(0);
  });
});
