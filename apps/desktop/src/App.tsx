import { useEffect, useMemo, useState } from "react";
import { openCanon, type Canon } from "./data/canon";
import { resolveEpisodeList, type EpisodeListResult } from "./state/coreProgress";
import {
  createProgressStore,
  describeProgress,
  localStorageAdapter,
  parseProgressInput,
  type Progress,
} from "./state/progress";

export function App() {
  const store = useMemo(() => createProgressStore(localStorageAdapter()), []);
  const [progress, setProgress] = useState<Progress>(() => store.get());
  const [season, setSeason] = useState(String(progress.season));
  const [episode, setEpisode] = useState(String(progress.episode));
  const [error, setError] = useState<string | null>(null);
  const [canon, setCanon] = useState<Canon | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let opened: Canon | null = null;
    openCanon().then(
      (c) => {
        if (cancelled) c.close();
        else { opened = c; setCanon(c); }
      },
      (e) => {
        console.error("Series data load failed:", e instanceof Error ? e.message : "unknown error");
        if (!cancelled) setLoadError(true);
      },
    );
    return () => {
      cancelled = true;
      opened?.close();
    };
  }, []);

  const result = useMemo<EpisodeListResult | null>(
    () => (canon ? resolveEpisodeList(canon, progress) : null),
    [canon, progress],
  );

  function save() {
    const next = parseProgressInput(season, episode);
    if (next === null) {
      setError("Season and episode must be positive whole numbers (or end of season).");
      return;
    }
    const result = store.set(next);
    if (result.ok) {
      setProgress(store.get());
      setError(null);
    } else {
      setError(result.error);
    }
  }

  return (
    <main className="home">
      <h1 className="title-card">
        <span className="title-light">The</span>{" "}
        <span className="title-medium">Mentalist</span>
      </h1>
      <p className="subtitle">Archive</p>

      <section className="progress" aria-label="Watch progress">
        <p>
          Watched through: <strong>{describeProgress(progress)}</strong>
        </p>
        <div className="controls">
          <label>
            Season
            <input value={season} onChange={(e) => setSeason(e.target.value)} />
          </label>
          <label>
            Episode (number or “end”)
            <input value={episode} onChange={(e) => setEpisode(e.target.value)} />
          </label>
          <button type="button" onClick={save}>
            Update progress
          </button>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </section>

      {loadError ? (
        <p className="error" role="alert">The series data could not be loaded.</p>
      ) : !canon ? (
        <p className="empty">Loading series data…</p>
      ) : result === null ? null : result.kind === "not-found" ? (
        <p className="error" role="alert">That season and episode are not in the series data.</p>
      ) : result.kind === "error" ? (
        <p className="error" role="alert">Could not read the series data.</p>
      ) : (
        <section className="episodes" aria-label="Episodes">
          {result.groups.map((g) => (
            <div key={g.season} className="season">
              <h2>Season {g.season}</h2>
              <ol>
                {g.episodes.map((e) => (
                  <li key={e.number} className={e.watched ? "ep" : "ep unwatched"}>
                    <span className="ep-num">{e.season}x{String(e.number).padStart(2, "0")}</span>
                    <span className="ep-body">
                      <span className="ep-title">{e.title}</span>
                      {!e.watched && <span className="ep-flag">Not watched yet</span>}
                      <span className="ep-synopsis">{e.synopsis}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
