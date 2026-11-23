import {
  NotFoundError,
  endOfSeason,
  resolveProgress,
  type EpisodeView,
  type KnowledgeEngine,
  type Progress as CoreProgress,
  type SqlDriver,
} from "@mentalist/core";
import type { Progress } from "./progress";

/**
 * Map the owner's stored progress to a core Progress. Throws NotFoundError
 * when the season/episode does not exist in the loaded data.
 */
export function toCoreProgress(db: SqlDriver, p: Progress): CoreProgress {
  return p.episode === "end"
    ? endOfSeason(db, p.season)
    : resolveProgress(db, { season: p.season, episode: p.episode });
}

/** View model for the list: exactly what EpisodeView exposes, nothing more. */
export interface EpisodeRow {
  watched: boolean;
  season: number;
  number: number;
  title: string;
  synopsis: string;
}

export interface SeasonGroup {
  season: number;
  episodes: EpisodeRow[];
}

export function episodeRow(e: EpisodeView): EpisodeRow {
  return { watched: e.watched, season: e.season, number: e.number, title: e.title, synopsis: e.synopsis };
}

export function listBySeason(engine: KnowledgeEngine, p: CoreProgress): SeasonGroup[] {
  const groups: SeasonGroup[] = [];
  for (const e of engine.listEpisodes(p)) {
    let g = groups[groups.length - 1];
    if (!g || g.season !== e.season) {
      g = { season: e.season, episodes: [] };
      groups.push(g);
    }
    g.episodes.push(episodeRow(e));
  }
  return groups;
}

export type EpisodeListResult =
  | { kind: "ok"; groups: SeasonGroup[] }
  | { kind: "not-found" }
  | { kind: "error" };

/** Only NotFoundError means "not in the data"; anything else is a failure. Never logs data. */
export function resolveEpisodeList(
  canon: { db: SqlDriver; engine: KnowledgeEngine },
  p: Progress,
): EpisodeListResult {
  try {
    return { kind: "ok", groups: listBySeason(canon.engine, toCoreProgress(canon.db, p)) };
  } catch (e) {
    if (e instanceof NotFoundError) return { kind: "not-found" };
    console.error("Series data query failed:", e instanceof Error ? e.name : "unknown error");
    return { kind: "error" };
  }
}
