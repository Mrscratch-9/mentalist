import type { CharacterRecord } from "../fandom/characters.ts";
import { normTitle, slug, wikiSrcKey, wikiUrl, type OutClaim, type OutEntity } from "./common.ts";
import type { LinkResolver, PersonRef } from "./links.ts";

export interface CharactersOptions {
  wikiBase: string;
}

export interface CharactersResult {
  entities: OutEntity[];
  claims: OutClaim[];
  /** Persons by normalized page title, for the guest and fan generators. */
  personsByTitle: Map<string, PersonRef>;
  stats: {
    persons: number;
    recurring: number;
    skippedNoFirst: number;
    skippedUnresolved: number;
    keyCollisions: number;
  };
}

const LATER = /\b(?:later|then|formerly|previously|until|now|eventually|before|after|becomes|became)\b/i;

/** First clause of the infobox `job`: no later-career text, parentheticals or alternatives. */
export function roleFromJob(job: string | null): string | null {
  if (!job) return null;
  let s = job;
  const cut = [s.search(/[,;(\/]/), s.search(/\s[-–—]\s/), s.search(LATER)].filter((i) => i >= 0);
  if (cut.length) s = s.slice(0, Math.min(...cut));
  s = s.trim();
  return s === "" ? null : s;
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** One `person` per character page whose `first` appearance resolves to an episode. Never imports status/last/family. */
export function generateCharacters(
  records: CharacterRecord[],
  resolver: LinkResolver,
  opts: CharactersOptions,
): CharactersResult {
  const entities: OutEntity[] = [];
  const claims: OutClaim[] = [];
  const personsByTitle = new Map<string, PersonRef>();
  const stats = { persons: 0, recurring: 0, skippedNoFirst: 0, skippedUnresolved: 0, keyCollisions: 0 };
  const keys = new Set<string>();

  for (const r of records) {
    if (r.first === null || r.first === "") {
      stats.skippedNoFirst++;
      continue;
    }
    const intro = resolver.episode(r.first)?.first;
    if (intro === undefined) {
      stats.skippedUnresolved++;
      continue;
    }
    const base = slug(r.pageTitle);
    const key = `p-${base}`;
    if (base === "" || keys.has(key)) {
      stats.keyCollisions++;
      continue;
    }
    keys.add(key);
    entities.push({ key, kind: "person", introduced: intro });
    personsByTitle.set(normTitle(r.pageTitle), { key, introduced: intro });
    stats.persons++;

    const note = wikiUrl(opts.wikiBase, r.pageTitle, r.revid);
    const add = (predicate: string, value: string): void => {
      claims.push({ key: `c-${key}-${predicate}`, subject: key, predicate, value, revealed: intro, source: wikiSrcKey(intro), note });
    };
    add("name", r.name);
    if (r.actor) add("actor", r.actor);
    const role = roleFromJob(r.job);
    if (role) add("role", role);
    if (r.categories.some((c) => /^(main|recurring) characters$/i.test(c))) {
      add("recurring", "true");
      stats.recurring++;
    }
  }
  entities.sort((a, b) => cmp(a.key, b.key));
  claims.sort((a, b) => cmp(a.key, b.key));
  return { entities, claims, personsByTitle, stats };
}
