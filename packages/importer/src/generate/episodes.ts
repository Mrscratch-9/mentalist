import { plainText } from "../fandom/wikitext.ts";
import type { EpisodeRecord } from "../fandom/episodes.ts";
import type { TmdbEpisode } from "../tmdb/client.ts";
import { cleanEpisodeTitle, codeOf, compareCodes, srcKey, tmdbSrcKey, wikiSrcKey, wikiUrl, type OutSource } from "./common.ts";

export interface OutEpisode {
  code: string;
  title: string;
  synopsis: string;
  details: string;
}

export interface EpisodesResult {
  episodes: OutEpisode[];
  sources: OutSource[];
  stats: { total: number; missingSynopsis: number; duplicates: number };
}

export interface EpisodesOptions {
  wikiBase: string;
  tmdbShowId?: number;
}

/** One episode per S#E# (a double page yields two), with the episode and wiki sources every later claim points at. */
export function generateEpisodes(
  records: EpisodeRecord[],
  tmdb: TmdbEpisode[] | undefined,
  opts: EpisodesOptions,
): EpisodesResult {
  const sorted = records
    .map((r) => ({ r, code: codeOf(r.season, r.episode) }))
    .sort((a, b) => compareCodes(a.code, b.code));
  const tmdbBy = new Map((tmdb ?? []).map((t) => [codeOf(t.season, t.episode), t]));
  const seen = new Set<string>();
  const episodes: OutEpisode[] = [];
  const sources: OutSource[] = [];
  let duplicates = 0;
  let missingSynopsis = 0;
  for (const { r, code } of sorted) {
    if (seen.has(code)) {
      duplicates++;
      continue;
    }
    seen.add(code);
    const t = tmdbBy.get(code);
    const synopsis = plainText(t?.overview ?? "");
    if (synopsis === "") missingSynopsis++;
    episodes.push({ code, title: plainText(cleanEpisodeTitle(r.pageTitle)), synopsis, details: "" });
    const url = wikiUrl(opts.wikiBase, r.pageTitle, r.revid);
    sources.push({ key: srcKey(code), kind: "episode", episode: code, url });
    sources.push({ key: wikiSrcKey(code), kind: "wiki", episode: code, url });
    if (t && opts.tmdbShowId !== undefined) {
      sources.push({
        key: tmdbSrcKey(code),
        kind: "other",
        url: `https://www.themoviedb.org/tv/${opts.tmdbShowId}/season/${r.season}/episode/${r.episode}`,
      });
    }
  }
  sources.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { episodes, sources, stats: { total: episodes.length, missingSynopsis, duplicates } };
}
