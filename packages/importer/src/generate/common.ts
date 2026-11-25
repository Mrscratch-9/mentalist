/** Shared helpers for the generators (pure, no I/O). */

export const FINALE = "S7E13";
export const DEFAULT_WIKI_BASE = "https://thementalist.fandom.com/wiki/";

export interface OutSource {
  key: string;
  kind: "episode" | "wiki" | "other";
  episode?: string;
  url?: string;
}
export interface OutClaim {
  key: string;
  subject: string;
  predicate: string;
  value: string;
  revealed: string;
  source: string;
  note: string;
}
export interface OutEntity {
  key: string;
  kind: "person";
  introduced: string;
}

export const codeOf = (season: number, episode: number): string => `S${season}E${episode}`;

export function parseCode(code: string): { season: number; episode: number } | null {
  const m = /^S(\d+)E(\d+)$/.exec(code);
  return m ? { season: Number(m[1]), episode: Number(m[2]) } : null;
}

const ord = (code: string): number => {
  const p = parseCode(code);
  return p ? p.season * 1000 + p.episode : Number.NaN;
};

export const compareCodes = (a: string, b: string): number => ord(a) - ord(b);

export function maxCode(codes: Iterable<string>): string | null {
  let best: string | null = null;
  for (const c of codes) if (best === null || compareCodes(c, best) > 0) best = c;
  return best;
}

export const srcKey = (code: string): string => `src-${code.toLowerCase()}`;
export const wikiSrcKey = (code: string): string => `src-wiki-${code.toLowerCase()}`;
export const tmdbSrcKey = (code: string): string => `src-tmdb-${code.toLowerCase()}`;

/** Lowercase ASCII slug of a page title: diacritics dropped, non-alphanumerics become single dashes. */
export function slug(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Normalized key for title lookups (underscores, case, surrounding space). */
export const normTitle = (t: string): string => t.replace(/_/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

export function wikiUrl(base: string, title: string, revid?: number): string {
  const path = encodeURIComponent(title.replace(/ /g, "_")).replace(/%3A/g, ":").replace(/%2C/g, ",");
  return `${base}${path}${revid ? `?oldid=${revid}` : ""}`;
}

/** Page title without a trailing `(episode)` style disambiguation. */
export const cleanEpisodeTitle = (t: string): string => t.replace(/\s*\((?:tv )?episode\)\s*$/i, "").trim();
