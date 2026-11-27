import type { EpisodeRecord } from "../fandom/episodes.ts";
import { personName, type CharacterRecord } from "../fandom/characters.ts";
import { plainText } from "../fandom/wikitext.ts";
import { codeOf, compareCodes, FINALE, normTitle, slug, wikiSrcKey, wikiUrl, type OutClaim, type OutEntity } from "./common.ts";
import type { LinkResolver, PersonRef } from "./links.ts";

export { personName };

export interface CharactersOptions {
  wikiBase: string;
  /** Episode records whose Guests/Recurring credits decide when an actor may be shown. */
  episodes?: EpisodeRecord[];
}

export interface CharactersResult {
  entities: OutEntity[];
  claims: OutClaim[];
  /** Persons by normalized page title, for the guest and fan generators. */
  personsByTitle: Map<string, PersonRef>;
  /** Last-appearance code by normalized page title (series finale when missing/unresolvable). For gating only; never emitted. */
  lastByTitle: Map<string, string>;
  stats: {
    persons: number;
    recurring: number;
    skippedNoFirst: number;
    skippedUnresolved: number;
    keyCollisions: number;
    /** `actor` claims revealed at the introduction / moved to a later credited episode / not emitted. */
    actorsKept: number;
    actorsMoved: number;
    actorsDropped: number;
  };
}

/**
 * Main characters whose identity is a mystery: the series' main cast lists their actor from the start, so the pilot
 * exception does not apply to them (only an episode credit can reveal the actor). Page titles, normalized.
 */
export const MYSTERY_IDENTITIES: ReadonlySet<string> = new Set(["red john"]);

const actorKey = (s: string): string => normTitle(plainText(s));

/**
 * First episode (>= `intro`) whose credits list `actor` for the character. The infobox actor is the FINAL one and can
 * reveal a mystery identity, so it is only shown from the episode that credits it for that character.
 */
function firstCreditedEpisode(
  episodes: EpisodeRecord[],
  resolver: LinkResolver,
  r: CharacterRecord,
  actor: string,
  intro: string,
): EpisodeRecord | null {
  const page = resolver.canonical(r.pageTitle);
  const name = normTitle(personName(r.pageTitle));
  const want = actorKey(actor);
  let best: EpisodeRecord | null = null;
  for (const e of episodes) {
    const code = codeOf(e.season, e.episode);
    if (compareCodes(code, intro) < 0 || (best && compareCodes(code, codeOf(best.season, best.episode)) >= 0)) continue;
    const hit = [...e.guests, ...e.recurring].some((c) => {
      const who = c.characterPage ? resolver.canonical(c.characterPage) === page : normTitle(c.role) === name;
      const a = actorKey(c.actor);
      return who && a !== "" && (a === want || (a.length >= 3 && want.includes(a)));
    });
    if (hit) best = e;
  }
  return best;
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
  const lastByTitle = new Map<string, string>();
  const stats = { persons: 0, recurring: 0, skippedNoFirst: 0, skippedUnresolved: 0, keyCollisions: 0, actorsKept: 0, actorsMoved: 0, actorsDropped: 0 };
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
    lastByTitle.set(normTitle(r.pageTitle), (r.lastEpisode ? resolver.episode(r.lastEpisode)?.last : undefined) ?? FINALE);
    stats.persons++;

    const note = wikiUrl(opts.wikiBase, r.pageTitle, r.revid);
    const add = (predicate: string, value: string, at: string = intro): void => {
      claims.push({ key: `c-${key}-${predicate}`, subject: key, predicate, value, revealed: at, source: wikiSrcKey(at), note });
    };
    // Never the infobox name/alias/job (final values) and never a role: the page title is the only safe name.
    add("name", personName(r.pageTitle));
    const actor = r.actor ? plainText(r.actor) : "";
    if (actor) {
      const mainPilot = intro === "S1E1" && !MYSTERY_IDENTITIES.has(normTitle(personName(r.pageTitle))) && r.categories.some((c) => /^main characters$/i.test(c));
      const credited = mainPilot ? null : firstCreditedEpisode(opts.episodes ?? [], resolver, r, actor, intro);
      const at = mainPilot ? intro : credited ? codeOf(credited.season, credited.episode) : null;
      if (at === null) stats.actorsDropped++;
      else {
        add("actor", actor, at);
        if (at === intro) stats.actorsKept++;
        else stats.actorsMoved++;
      }
    }
    if (r.categories.some((c) => /^(main|recurring) characters$/i.test(c))) {
      add("recurring", "true");
      stats.recurring++;
    }
  }
  entities.sort((a, b) => cmp(a.key, b.key));
  claims.sort((a, b) => cmp(a.key, b.key));
  return { entities, claims, personsByTitle, lastByTitle, stats };
}
