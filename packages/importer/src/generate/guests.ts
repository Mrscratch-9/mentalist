import type { EpisodeRecord } from "../fandom/episodes.ts";
import { codeOf, compareCodes, wikiSrcKey, wikiUrl, type OutClaim } from "./common.ts";
import type { LinkResolver } from "./links.ts";

export interface GuestsResult {
  claims: OutClaim[];
  stats: { claims: number; unlinked: number; unknownPerson: number; beforeIntroduction: number };
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** `appears_in` claims: subject = person, value = episode code, revealed at that same episode. */
export function generateGuests(
  episodes: EpisodeRecord[],
  resolver: LinkResolver,
  opts: { wikiBase: string },
): GuestsResult {
  const claims = new Map<string, OutClaim>();
  const stats = { claims: 0, unlinked: 0, unknownPerson: 0, beforeIntroduction: 0 };
  for (const e of episodes) {
    const code = codeOf(e.season, e.episode);
    const note = wikiUrl(opts.wikiBase, e.pageTitle, e.revid);
    const seen = new Set<string>();
    for (const credit of [...e.guests, ...e.recurring]) {
      if (!credit.characterPage) {
        stats.unlinked++;
        continue;
      }
      const person = resolver.person(credit.characterPage);
      if (!person) {
        stats.unknownPerson++;
        continue;
      }
      if (seen.has(person.key)) continue;
      seen.add(person.key);
      if (compareCodes(code, person.introduced) < 0) {
        stats.beforeIntroduction++;
        continue;
      }
      const key = `c-${person.key}-appears-${code.toLowerCase()}`;
      if (claims.has(key)) continue;
      claims.set(key, { key, subject: person.key, predicate: "appears_in", value: code, revealed: code, source: wikiSrcKey(code), note });
    }
  }
  const out = [...claims.values()].sort(
    (a, b) => cmp(a.subject, b.subject) || compareCodes(a.value, b.value),
  );
  stats.claims = out.length;
  return { claims: out, stats };
}
