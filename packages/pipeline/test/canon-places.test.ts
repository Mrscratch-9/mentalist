import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { textHash } from "../src/index.ts";

// Curated case places (app v2 T2a). Checks the real canon by keys and counts only: it must never print canon text.
const dir = fileURLToPath(new URL("../../../data/canon/", import.meta.url));
const read = (f: string) => (parse(readFileSync(dir + f, "utf8")) ?? {}) as Record<string, any[] | undefined>;

type En = { key: string; kind: string; introduced: string };
type Cl = { key: string; subject: string; predicate: string; object?: string; value?: string; revealed: string; source: string };

const ord = (code: string) => {
  const m = /^S(\d+)E(\d+)$/.exec(code);
  if (!m) throw new Error(`bad episode code ${code}`);
  return Number(m[1]) * 100 + Number(m[2]);
};
const OWNER_PROGRESS = ord("S6E12");

const sourceEpisode = new Map<string, string>(
  (read("generated/episodes.yaml").sources ?? []).map((s: { key: string; episode: string }) => [s.key, s.episode]),
);
const entities = new Map<string, En>();
const claims: Cl[] = [];
for (let n = 1; n <= 7; n++) {
  const d = read(`cases-s${n}.yaml`);
  for (const e of (d.entities ?? []) as En[]) entities.set(e.key, e);
  claims.push(...((d.claims ?? []) as Cl[]));
}
const placeClaims = claims.filter((c) => entities.get(c.subject)?.kind === "location");
const has = (subject: string, predicate: string) => placeClaims.some((c) => c.subject === subject && c.predicate === predicate);

describe("curated case places (keys and counts only)", () => {
  it("reveals every place claim at its source episode, never before its place or its case", () => {
    const bad = placeClaims.filter((c) => {
      const srcEp = sourceEpisode.get(c.source);
      if (srcEp !== undefined && srcEp !== c.revealed) return true;
      if (ord(c.revealed) < ord(entities.get(c.subject)!.introduced)) return true;
      const obj = c.object ? entities.get(c.object) : undefined;
      return obj !== undefined && ord(obj.introduced) > ord(c.revealed);
    });
    expect(bad.map((c) => c.key)).toEqual([]);
  });

  it("gives each case at most one case_site, always a place with coordinates linked to that case", () => {
    const perCase = new Map<string, number>();
    const bad: string[] = [];
    for (const c of placeClaims.filter((x) => x.predicate === "case_site")) {
      const link = placeClaims.find((x) => x.subject === c.subject && x.predicate === "part_of_case");
      if (!has(c.subject, "coordinates") || !link?.object) bad.push(c.key);
      else perCase.set(link.object, (perCase.get(link.object) ?? 0) + 1);
    }
    expect(bad).toEqual([]);
    expect([...perCase].filter(([, n]) => n > 1).map(([k]) => k)).toEqual([]);
  });

  it("uses neutral keys for places introduced after the owner's progress", () => {
    const named = [...entities.values()]
      .filter((e) => e.kind === "location" && ord(e.introduced) > OWNER_PROGRESS && !/^l-s\de\d+-[a-z]$/.test(e.key))
      .map((e) => e.key);
    expect(named).toEqual([]);
  });

  it("hashes every place translation from the current English text", () => {
    const byKey = new Map(claims.map((c) => [c.key, c]));
    const stale: string[] = [];
    let count = 0;
    for (let n = 1; n <= 7; n++) {
      for (const t of (read(`i18n/es/places-s${n}.yaml`).translations ?? []) as { key: string; field: "value"; hash: string }[]) {
        count++;
        const en = byKey.get(t.key)?.[t.field];
        if (typeof en !== "string" || textHash(en) !== String(t.hash)) stale.push(t.key);
      }
    }
    expect(count).toBeGreaterThan(0);
    expect(stale).toEqual([]);
  });
});
