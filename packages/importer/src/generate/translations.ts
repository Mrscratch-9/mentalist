import { textHash } from "@mentalist/pipeline";
import { plainText } from "../fandom/wikitext.ts";
import type { TmdbEpisode } from "../tmdb/client.ts";
import { codeOf } from "./common.ts";
import type { OutEpisode } from "./episodes.ts";

/** One entry of `data/canon/i18n/<lang>/*.yaml`: `hash` = textHash of the English text it translates. */
export interface OutTranslation {
  key: string;
  field: "title" | "synopsis";
  hash: string;
  text: string;
}

export interface EpisodeTranslations {
  doc: { translations: OutTranslation[] };
  /** `missing`: English texts that have no usable secondary-language text. */
  stats: { titles: number; synopses: number; missing: number };
}

/** "es-MX" -> "es": the directory under data/canon/i18n. */
export const langDir = (locale: string): string => (locale.split(/[-_]/)[0] ?? "").toLowerCase();

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Title and synopsis translations of the generated English episodes from a second TMDB language.
 * An entry exists only when both the English text and the secondary text are non-empty; the hash is of the
 * English text exactly as written to episodes.yaml, so any later English change marks it stale.
 */
export function generateEpisodeTranslations(english: OutEpisode[], secondary: TmdbEpisode[]): EpisodeTranslations {
  const by = new Map(secondary.map((t) => [codeOf(t.season, t.episode), t]));
  const translations: OutTranslation[] = [];
  const stats = { titles: 0, synopses: 0, missing: 0 };
  for (const e of english) {
    const t = by.get(e.code);
    for (const field of ["title", "synopsis"] as const) {
      if (e[field] === "") continue;
      const text = plainText(field === "title" ? (t?.name ?? "") : (t?.overview ?? ""));
      if (text === "") { stats.missing++; continue; }
      translations.push({ key: e.code, field, hash: textHash(e[field]), text });
      stats[field === "title" ? "titles" : "synopses"]++;
    }
  }
  translations.sort((x, y) => cmp(x.key, y.key) || cmp(x.field, y.field));
  return { doc: { translations }, stats };
}

/**
 * Fetches `language` for every season and builds the translations file content. Returns undefined when there is
 * nothing to do: same base language as the primary one, or offline with no cached secondary language (an
 * offline run must still work without it). Any other failure is thrown.
 */
export async function fetchEpisodeTranslations(
  client: { getAllSeasons(language: string): Promise<TmdbEpisode[]> },
  english: OutEpisode[],
  language: string,
  primaryLanguage = "en-US",
): Promise<(EpisodeTranslations & { lang: string }) | undefined> {
  if (langDir(language) === langDir(primaryLanguage)) return undefined;
  let secondary: TmdbEpisode[];
  try {
    secondary = await client.getAllSeasons(language);
  } catch (e) {
    if (e instanceof Error && e.message === "offline: TMDB cache missing") return undefined;
    throw e;
  }
  return { lang: langDir(language), ...generateEpisodeTranslations(english, secondary) };
}
