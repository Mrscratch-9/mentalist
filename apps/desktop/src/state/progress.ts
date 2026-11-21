// User-state progress: "watched through season S, episode E, inclusive".
// Framework-free. No episode counts are hard-coded: the end of a season is the
// explicit form `episode: "end"`.

export type Progress = { season: number; episode: number | "end" };

export type Result = { ok: true } | { ok: false; error: string };

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const PROGRESS_KEY = "mentalist.progress.v1";

/** The owner's configured progress: watched through the end of season 5. */
export const OWNER_PROGRESS: Progress = { season: 5, episode: "end" };

const isPositiveInt = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n) && n > 0;

export function isValidProgress(p: unknown): p is Progress {
  if (typeof p !== "object" || p === null) return false;
  const { season, episode } = p as Record<string, unknown>;
  return isPositiveInt(season) && (episode === "end" || isPositiveInt(episode));
}

export function memoryStorage(): StorageAdapter {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
}

export function localStorageAdapter(): StorageAdapter {
  return {
    getItem: (k) => globalThis.localStorage.getItem(k),
    setItem: (k, v) => globalThis.localStorage.setItem(k, v),
  };
}

export interface ProgressStore {
  /** Persisted progress. */
  get(): Progress;
  /** Validate and persist; invalid input leaves the stored value unchanged. */
  set(p: Progress): Result;
  /** Temporary peek, held in memory only, never written to storage. */
  startPeek(p: Progress): Result;
  clearPeek(): void;
  /** Peek if active, otherwise persisted progress. */
  effective(): Progress;
}

export function createProgressStore(
  storage: StorageAdapter,
  initial: Progress = OWNER_PROGRESS,
): ProgressStore {
  let peek: Progress | null = null;

  const get = (): Progress => {
    try {
      const raw = storage.getItem(PROGRESS_KEY);
      if (raw === null) return { ...initial };
      const parsed: unknown = JSON.parse(raw);
      if (isValidProgress(parsed)) {
        return { season: parsed.season, episode: parsed.episode };
      }
    } catch {
      // unreadable storage or corrupt value: fall through to the configured value
    }
    return { ...initial };
  };

  const invalid: Result = {
    ok: false,
    error: "Season and episode must be positive whole numbers (or end of season).",
  };

  return {
    get,
    set(p) {
      if (!isValidProgress(p)) return invalid;
      try {
        storage.setItem(
          PROGRESS_KEY,
          JSON.stringify({ season: p.season, episode: p.episode }),
        );
      } catch {
        return { ok: false, error: "Could not save progress." };
      }
      return { ok: true };
    },
    startPeek(p) {
      if (!isValidProgress(p)) return invalid;
      peek = { season: p.season, episode: p.episode };
      return { ok: true };
    },
    clearPeek() {
      peek = null;
    },
    effective: () => (peek ? { ...peek } : get()),
  };
}

/**
 * Parse the home form's text fields. Episode accepts a positive whole number or
 * "end" (case-insensitive). Returns null for anything else.
 */
export function parseProgressInput(
  season: string,
  episode: string,
): Progress | null {
  const toInt = (s: string): number | null =>
    /^\d+$/.test(s.trim()) ? Number(s.trim()) : null;
  const e = episode.trim().toLowerCase() === "end" ? "end" : toInt(episode);
  const p = { season: toInt(season), episode: e };
  return isValidProgress(p) ? p : null;
}

export function describeProgress(p: Progress): string {
  return p.episode === "end"
    ? `end of season ${p.season}`
    : `season ${p.season}, episode ${p.episode}`;
}
