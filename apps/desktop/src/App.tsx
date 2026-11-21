import { useMemo, useState } from "react";
import {
  createProgressStore,
  describeProgress,
  localStorageAdapter,
  type Progress,
} from "./state/progress";

export function App() {
  const store = useMemo(() => createProgressStore(localStorageAdapter()), []);
  const [progress, setProgress] = useState<Progress>(() => store.get());
  const [season, setSeason] = useState(String(progress.season));
  const [episode, setEpisode] = useState(String(progress.episode));
  const [error, setError] = useState<string | null>(null);

  function save() {
    const next: Progress = {
      season: Number(season),
      episode: episode.trim().toLowerCase() === "end" ? "end" : Number(episode),
    };
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

      <p className="empty">No series data loaded yet.</p>
    </main>
  );
}
