import type { EpisodeRecord } from "../fandom/episodes.ts";
import { codeOf, compareCodes, maxCode, normTitle } from "./common.ts";

export interface PersonRef {
  key: string;
  introduced: string;
}

export interface LinkResolver {
  /** First and last code of the page of an episode (double episodes span two codes). */
  episode(title: string): { first: string; last: string } | null;
  person(title: string): PersonRef | null;
  /** Normalized title after following one redirect (the title itself when none). */
  canonical(title: string): string;
  /** Latest code a wiki link implies (episode, season finale, or person introduction); null when unknown. */
  code(title: string): string | null;
}

export interface LinkResolverInput {
  episodes: EpisodeRecord[];
  /** Redirect title -> target title. */
  redirects?: Map<string, string>;
  /** Persons by normalized page title (see `normTitle`). */
  persons?: Map<string, PersonRef>;
}

export function createLinkResolver(input: LinkResolverInput): LinkResolver {
  const redirects = new Map<string, string>();
  for (const [from, to] of input.redirects ?? []) redirects.set(normTitle(from), to);
  const persons = input.persons ?? new Map<string, PersonRef>();

  const byPage = new Map<string, string[]>();
  const seasonLast = new Map<number, string>();
  for (const e of input.episodes) {
    const k = normTitle(e.pageTitle);
    const list = byPage.get(k) ?? [];
    list.push(codeOf(e.season, e.episode));
    byPage.set(k, list);
    const last = seasonLast.get(e.season);
    const code = codeOf(e.season, e.episode);
    if (last === undefined || maxCode([last, code]) === code) seasonLast.set(e.season, code);
  }

  const lookup = <T>(title: string, get: (norm: string) => T | undefined): T | null => {
    const direct = get(normTitle(title));
    if (direct !== undefined) return direct;
    const target = redirects.get(normTitle(title));
    if (target !== undefined) {
      const viaRedirect = get(normTitle(target));
      if (viaRedirect !== undefined) return viaRedirect;
    }
    return null;
  };

  const episode: LinkResolver["episode"] = (title) =>
    lookup(title, (n) => {
      const codes = byPage.get(n);
      return codes ? { first: [...codes].sort(compareCodes)[0]!, last: maxCode(codes)! } : undefined;
    });
  const person: LinkResolver["person"] = (title) => lookup(title, (n) => persons.get(n));

  return {
    episode,
    person,
    canonical: (title) => normTitle(redirects.get(normTitle(title)) ?? title),
    code(title) {
      const e = episode(title);
      if (e) return e.last;
      const p = person(title);
      if (p) return p.introduced;
      const s = /^season\s+(\d+)$/i.exec(normTitle(title));
      return s ? (seasonLast.get(Number(s[1])) ?? null) : null;
    },
  };
}

