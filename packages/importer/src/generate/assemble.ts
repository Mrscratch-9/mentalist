import type { CharacterRecord } from "../fandom/characters.ts";
import type { FandomPage } from "../fandom/client.ts";
import type { EpisodeRecord } from "../fandom/episodes.ts";
import { extractLinks } from "../fandom/wikitext.ts";
import type { TmdbEpisode } from "../tmdb/client.ts";
import { generateCharacters } from "./characters.ts";
import { normTitle } from "./common.ts";
import { generateEpisodes } from "./episodes.ts";
import { buildPhrases, generateFans, triviaText, type FanPage } from "./fans.ts";
import { generateGuests } from "./guests.ts";
import { createLinkResolver } from "./links.ts";

export interface AssembleInput {
  episodes: EpisodeRecord[];
  characters: CharacterRecord[];
  /** Episode and character pages whose Trivia section feeds the fans section. */
  pages: Array<{ page: FandomPage; kind: "episode" | "character" }>;
  redirects?: Map<string, string>;
  tmdb?: TmdbEpisode[] | undefined;
  tmdbShowId?: number;
  wikiBase: string;
}

/** Counts only: nothing here carries canon text. */
export interface Report {
  episodes: number;
  missingSynopsis: number;
  duplicateEpisodes: number;
  persons: number;
  recurring: number;
  skippedNoFirst: number;
  skippedUnresolved: number;
  keyCollisions: number;
  actorsKept: number;
  actorsMoved: number;
  actorsDropped: number;
  guestClaims: number;
  guestUnlinked: number;
  guestUnknownPerson: number;
  guestBeforeIntroduction: number;
  fans: number;
  fansBySeason: Record<number, number>;
  fanUnresolvedLinkItems: number;
  fanNoOwnEpisodeItems: number;
}

export interface Assembled {
  docs: Record<string, Record<string, unknown>>;
  report: Report;
}

/** Link targets (not already page titles we hold) whose redirects the caller should resolve first. */
export function collectLinkTargets(input: AssembleInput): string[] {
  const known = new Set<string>();
  for (const e of input.episodes) known.add(normTitle(e.pageTitle));
  for (const c of input.characters) known.add(normTitle(c.pageTitle));
  const out = new Map<string, string>();
  const add = (t: string | null | undefined): void => {
    if (t && !known.has(normTitle(t)) && !out.has(normTitle(t))) out.set(normTitle(t), t);
  };
  for (const c of input.characters) add(c.first);
  for (const e of input.episodes) for (const cr of [...e.guests, ...e.recurring]) add(cr.characterPage);
  for (const p of input.pages) {
    for (const l of extractLinks(triviaText(p.page.wikitext))) add(l.target);
  }
  return [...out.values()];
}

export function assemble(input: AssembleInput): Assembled {
  const opts = { wikiBase: input.wikiBase };
  const eps = generateEpisodes(input.episodes, input.tmdb, {
    ...opts,
    ...(input.tmdbShowId !== undefined ? { tmdbShowId: input.tmdbShowId } : {}),
  });
  const base = createLinkResolver({ episodes: input.episodes, ...(input.redirects ? { redirects: input.redirects } : {}) });
  const chars = generateCharacters(input.characters, base, { ...opts, episodes: input.episodes });
  const resolver = createLinkResolver({
    episodes: input.episodes,
    ...(input.redirects ? { redirects: input.redirects } : {}),
    persons: chars.personsByTitle,
  });
  const guests = generateGuests(input.episodes, resolver, opts);

  const fanPages: FanPage[] = input.pages.map(({ page, kind }) => ({
    page,
    kind,
    own: kind === "episode" ? (resolver.episode(page.title)?.last ?? null) : (resolver.person(page.title)?.introduced ?? null),
    last: kind === "character" ? (chars.lastByTitle.get(normTitle(page.title)) ?? null) : null,
  }));
  const fans = generateFans(fanPages, resolver, { ...opts, phrases: buildPhrases(input.episodes, input.characters, chars.personsByTitle) });

  return {
    docs: {
      "episodes.yaml": { episodes: eps.episodes, sources: eps.sources },
      "characters.yaml": { entities: chars.entities, claims: chars.claims },
      "guests.yaml": { claims: guests.claims },
      "fans.yaml": { theories: fans.theories },
    },
    report: {
      episodes: eps.stats.total,
      missingSynopsis: eps.stats.missingSynopsis,
      duplicateEpisodes: eps.stats.duplicates,
      persons: chars.stats.persons,
      recurring: chars.stats.recurring,
      skippedNoFirst: chars.stats.skippedNoFirst,
      skippedUnresolved: chars.stats.skippedUnresolved,
      keyCollisions: chars.stats.keyCollisions,
      actorsKept: chars.stats.actorsKept,
      actorsMoved: chars.stats.actorsMoved,
      actorsDropped: chars.stats.actorsDropped,
      guestClaims: guests.stats.claims,
      guestUnlinked: guests.stats.unlinked,
      guestUnknownPerson: guests.stats.unknownPerson,
      guestBeforeIntroduction: guests.stats.beforeIntroduction,
      fans: fans.stats.items,
      fansBySeason: fans.stats.bySeason,
      fanUnresolvedLinkItems: fans.stats.unresolvedLinkItems,
      fanNoOwnEpisodeItems: fans.stats.noOwnEpisodeItems,
    },
  };
}
