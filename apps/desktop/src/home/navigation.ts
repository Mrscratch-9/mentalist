/** Pure helpers for the progress pickers and keyboard navigation of lists. */
import type { SeasonGroup } from "../state/coreProgress";

export interface EpisodeOption {
  /** Episode number inside its season, as a string for <select>. */
  value: string;
  /** "12 · Title" (the title is already in the UI language: it comes from the translated engine). */
  label: string;
}

export interface PickerModel {
  seasons: number[];
  /** Episodes of each season, in broadcast order. */
  episodes: (season: number) => EpisodeOption[];
}

export function pickerModel(groups: SeasonGroup[]): PickerModel {
  return {
    seasons: groups.map((g) => g.season),
    episodes: (season) =>
      (groups.find((g) => g.season === season)?.episodes ?? []).map((e) => ({
        value: String(e.number),
        label: `${e.number} · ${e.title}`,
      })),
  };
}

/**
 * Next focused index in a list for an arrow/Home/End key, clamped to the list (no wrap).
 * Null for any other key or an empty list (the key keeps its normal behaviour).
 */
export function moveIndex(key: string, current: number, length: number): number | null {
  if (length <= 0) return null;
  const last = length - 1;
  switch (key) {
    case "ArrowDown":
    case "ArrowRight":
      return Math.min(last, current + 1);
    case "ArrowUp":
    case "ArrowLeft":
      return Math.max(0, current - 1);
    case "Home":
      return 0;
    case "End":
      return last;
    default:
      return null;
  }
}
