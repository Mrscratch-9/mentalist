import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { FandomCache } from "../../importer/src/fandom/cache.ts";
import { FandomClient } from "../../importer/src/fandom/client.ts";
import { parseCharacterPage, personName, type CharacterRecord } from "../../importer/src/fandom/characters.ts";
import { parseEpisodePage, type EpisodeRecord } from "../../importer/src/fandom/episodes.ts";
import { collectLinkTargets } from "../../importer/src/generate/assemble.ts";
import { slug } from "../../importer/src/generate/common.ts";
import { plainText } from "../../importer/src/fandom/wikitext.ts";
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

// Actor credits (counts only): the infobox actor is the FINAL one and can reveal a mystery identity.
const cacheDir = fileURLToPath(new URL("../../../data/.cache/fandom", import.meta.url));
const norm = (t: string): string => plainText(t).toLowerCase().replace(/[_\s]+/g, " ").trim();
const code = (e: EpisodeRecord): string => `S${e.season}E${e.episode}`;

describe("actor claims are revealed only where the episode credits that actor (counts only)", () => {
  const actorClaims = genClaims.filter((c) => c.predicate === "actor");
  it("p-red-john has no actor visible at S1E1", () => {
    expect(actorClaims.filter((c) => c.subject === "p-red-john" && order(c.revealed) <= order("S1E1")).length).toBe(0);
  });
  it.skipIf(!existsSync(cacheDir + "/pages"))("every actor claim's reveal episode credits that actor for that character", async () => {
    const client = new FandomClient({ cache: new FandomCache({ dir: cacheDir, offline: true }) });
    const episodes: EpisodeRecord[] = [];
    for (let s = 1; s <= 7; s++) {
      for (const page of await client.getCategoryPages(`Season ${s} episodes`, { namespace: 0 })) episodes.push(...parseEpisodePage(page));
    }
    const chars = new Map<string, CharacterRecord>();
    const pages: Parameters<typeof collectLinkTargets>[0]["pages"] = [];
    const seen = new Set<string>();
    for (const cat of ["Characters", "Main characters", "Recurring characters", "Minor Characters", "Side Characters"]) {
      for (const page of await client.getCategoryPages(cat, { namespace: 0 })) {
        if (seen.has(page.title)) continue;
        seen.add(page.title);
        const rec = parseCharacterPage(page);
        if (rec) pages.push({ page, kind: "character" });
        if (rec) chars.set("p-" + slug(rec.pageTitle), rec);
      }
    }
    // Same request set as the importer, so the offline cache answers it.
    for (let s = 1; s <= 7; s++) for (const page of await client.getCategoryPages(`Season ${s} episodes`, { namespace: 0 })) if (parseEpisodePage(page).length) pages.push({ page, kind: "episode" });
    const targets = collectLinkTargets({ episodes, characters: [...chars.values()], pages: [...pages.filter((p) => p.kind === "episode"), ...pages.filter((p) => p.kind === "character")], wikiBase: "" });
    const redirects = await client.resolveRedirects(targets);
    const canon = (t: string): string => norm(redirects.get(t) ?? t);
    let uncredited = 0;
    let mainPilot = 0;
    let missingRecord = 0;
    for (const c of actorClaims) {
      const rec = chars.get(c.subject);
      if (!rec) { missingRecord++; continue; }
      const isMainPilot = c.revealed === "S1E1" && rec.categories.some((k) => /^main characters$/i.test(k));
      if (isMainPilot) { mainPilot++; continue; }
      const eps = episodes.filter((e) => code(e) === c.revealed);
      const ok = eps.some((e) =>
        [...e.guests, ...e.recurring].some((cr) => {
          const who = cr.characterPage ? canon(cr.characterPage) === canon(rec.pageTitle) : norm(cr.role) === norm(personName(rec.pageTitle));
          const a = norm(cr.actor);
          return who && a !== "" && norm(c.value ?? "").includes(a);
        }),
      );
      if (!ok) uncredited++;
    }
    expect(missingRecord).toBe(0);
    expect(uncredited).toBe(0);
    expect(actorClaims.length).toBeGreaterThan(mainPilot);
  });
});
