import { useEffect, useMemo, useState } from "react";
import type { Canon } from "../data/canon";
import { parseProgressInput, type Progress } from "../state/progress";
import { Check, Open, SilCbi, SilJane, Smiley } from "./art";
import { RedMap } from "./RedMap";
import { resolveHome } from "./viewModel";
import "./redroom.css";

type View = "board" | "episodes";

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const q = matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(q.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return reduced;
}

interface Props {
  canon: Canon | null;
  loadError: boolean;
  progress: Progress;
  /** Persist new progress. Returns an error message, or null on success. */
  onChangeProgress: (next: Progress) => string | null;
}

const LEGEND_TEXT = {
  smiley: "Red John smiley — where he appeared",
  landmark: "Landmark — place from a watched episode",
  linked: "Gold ring — linked to the selected case",
  hover: "Dashed ring — hover",
} as const;

export function RedRoom({ canon, loadError, progress, onChangeProgress }: Props) {
  // Peek is React state only: never persisted, reset on reload and on any progress change.
  const [peekWanted, setPeekWanted] = useState(false);
  const [view, setView] = useState<View>("board");
  const [selCase, setSelCase] = useState<string | null>(null);
  const [selPin, setSelPin] = useState<string | null>(null);
  const [season, setSeason] = useState(String(progress.season));
  const [episode, setEpisode] = useState(String(progress.episode));
  const [formError, setFormError] = useState<string | null>(null);
  const [mapDown, setMapDown] = useState(false);
  const reduced = useReducedMotion();

  const result = useMemo(
    () => (canon ? resolveHome(canon, progress, peekWanted) : null),
    [canon, progress, peekWanted],
  );
  const ok = result?.kind === "ok" ? result : null;
  const pins = ok?.model.pins ?? [];
  const cases = ok?.model.cases ?? [];
  const characters = ok?.model.characters ?? [];
  const legend = ok?.model.legend ?? [];
  const gate = ok?.gate;
  const peeking = gate?.peeking ?? false;

  const pin = pins.find((p) => p.id === selPin) ?? pins[0] ?? null;
  const caseSel = cases.find((c) => c.id === selCase)?.id ?? null;

  function save() {
    const next = parseProgressInput(season, episode);
    if (next === null) {
      setFormError("Season and episode must be positive whole numbers (or end of season).");
      return;
    }
    const err = onChangeProgress(next);
    setFormError(err);
    if (err === null) setPeekWanted(false); // a progress change ends any peek
  }

  return (
    <div className="redroom">
      <header className="rr-top">
        <div className="rr-brand">
          <Smiley role="img" aria-label="Red John smiley mark" />
          <h1 className="rr-wordmark">
            <span className="rr-title-light">The</span> <span className="rr-title-medium">Mentalist</span>
            <small>Archive</small>
          </h1>
        </div>
        <section className="rr-gate" aria-label="Progress gate">
          <div className="rr-gate-val">
            <span className="rr-label">Watched through</span>
            <b>{gate ? gate.label : "…"}</b>
          </div>
          <form className="rr-change" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <div className="rr-field">
              <label className="rr-label" htmlFor="rr-season">Season</label>
              <input id="rr-season" inputMode="numeric" value={season} onChange={(e) => setSeason(e.target.value)} />
            </div>
            <div className="rr-field">
              <label className="rr-label" htmlFor="rr-episode">Episode or “end”</label>
              <input id="rr-episode" value={episode} onChange={(e) => setEpisode(e.target.value)} />
            </div>
            <button className="rr-btn" type="submit">Change</button>
          </form>
          <button
            className="rr-btn" type="button" aria-pressed={peeking} aria-describedby="gateNote"
            disabled={!gate || (!gate.canPeek && !peeking)}
            onClick={() => setPeekWanted(!peekWanted)}
          >
            {peeking ? "End peek" : "Peek next episode"}
          </button>
          {gate?.peeking && <span className="rr-peek-tag">Peek · temporary</span>}
          <p className="rr-gate-note" id="gateNote" aria-live="polite">
            <strong>Everything here is limited to your progress.</strong>{" "}
            {gate?.peeking
              ? `Peeking at ${gate.peekLabel} — resets on reload, progress unchanged.`
              : "Peek is temporary and never saved."}
          </p>
          {formError && <p className="rr-error" role="alert">{formError}</p>}
        </section>
      </header>

      <nav className="rr-nav" aria-label="Browse">
        <ul>
          <li><button aria-current={view === "board" ? "page" : undefined} onClick={() => setView("board")}>Board</button></li>
          <li><button aria-current={view === "episodes" ? "page" : undefined} onClick={() => setView("episodes")}>Episodes</button></li>
        </ul>
      </nav>

      <main>
        <h2 className="rr-sr">Investigation board: cases, California map and characters</h2>
        <RedMap
          pins={pins} selectedPin={pin?.id ?? null} linkedCase={caseSel}
          reducedMotion={reduced} onUnavailable={() => setMapDown(true)} onSelectPin={setSelPin}
        />
        {mapDown && <p className="rr-map-down" role="status">The basemap could not be loaded. Pins are listed in the legend panel.</p>}
        <svg className="rr-grain" aria-hidden="true" focusable="false">
          <filter id="rr-noise"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch" /><feColorMatrix type="saturate" values="0" /></filter>
          <rect width="100%" height="100%" filter="url(#rr-noise)" />
        </svg>
        <div className="rr-vignette" />

        {loadError ? (
          <p className="rr-banner" role="alert">The series data could not be loaded.</p>
        ) : result?.kind === "not-found" ? (
          <p className="rr-banner" role="alert">That season and episode are not in the series data.</p>
        ) : result?.kind === "error" ? (
          <p className="rr-banner" role="alert">Could not read the series data.</p>
        ) : null}

        <aside className="rr-rail rr-glass" aria-label="Case list">
          <div className="rr-panel-head">
            <h2>Case board</h2>
            <span>{ok ? `${ok.model.watchedEpisodes} of ${ok.model.totalEpisodes} episodes watched` : ""}</span>
          </div>
          {!ok ? (
            <p className="rr-empty">{canon || loadError ? "No data to show." : "Loading series data…"}</p>
          ) : cases.length === 0 ? (
            <div className="rr-empty">
              <strong>No cases on the board yet</strong>
              <p>Cases appear here once a watched episode introduces them.</p>
            </div>
          ) : (
            <ol className="rr-cases">
              {cases.map((c) => (
                <li key={c.id}>
                  <button className="rr-case" aria-current={caseSel === c.id} onClick={() => setSelCase(caseSel === c.id ? null : c.id)}>
                    <span className={c.solved ? "rr-plate" : "rr-plate rr-open"} aria-hidden="true">
                      {c.solved ? (c.silhouette === "cbi" ? <SilCbi /> : <SilJane />) : <Open />}
                    </span>
                    <span>
                      <span className="rr-ep">{c.code}</span>
                      <span className="rr-title">{c.title}</span>
                      <span className="rr-status">{c.solved ? <><Check aria-hidden="true" />Solved</> : "Open"}</span>
                      {peeking && c.code === gate?.peekLabel && <span className="rr-status rr-peeking">Peeking · temporary</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </aside>

        <aside className="rr-legend rr-glass" aria-label="Map legend and selection">
          <div className="rr-panel-head"><h2>California · 3D map</h2><span>Tilt 58°</span></div>
          <div className="rr-body">
            {legend.length === 0 ? (
              <div className="rr-empty rr-inline">
                <strong>No places on the map yet</strong>
                <p>Pins appear when a watched episode places something in California.</p>
              </div>
            ) : (
              <>
                <ul aria-label="Legend">
                  {legend.map((l) => (
                    <li key={l.kind}>
                      {l.kind === "smiley" && <Smiley aria-hidden="true" />}
                      {l.kind === "landmark" && (
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21 V10 L12 4 L21 10 V21 Z" fill="#151110" stroke="#d9b25a" strokeWidth="1.6" /><path d="M8 21 V14 H16 V21 M12 4 V1.5" fill="none" stroke="#d9b25a" strokeWidth="1.4" /></svg>
                      )}
                      {l.kind === "linked" && <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="#d9b25a" strokeWidth="1.6" /></svg>}
                      {l.kind === "hover" && <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="#ece4d8" strokeWidth="1.6" strokeDasharray="3 3" /></svg>}
                      {LEGEND_TEXT[l.kind]}
                    </li>
                  ))}
                </ul>
                {pin && (
                  <div className="rr-info" aria-live="polite">
                    <span className="rr-label">Selected pin</span>
                    <h3>{pin.label}</h3>
                    {pin.description && <p>{pin.description}</p>}
                  </div>
                )}
                <ul className="rr-pinlist" aria-label="Pins on the map">
                  {pins.map((p) => (
                    <li key={p.id}><button aria-pressed={p.id === pin?.id} onClick={() => setSelPin(p.id)}>{p.label}</button></li>
                  ))}
                </ul>
              </>
            )}
            <p className="rr-note">
              <strong>Pins follow your progress.</strong> Only places from episodes you have watched appear
              {gate ? ` (now ${gate.peekLabel ?? gate.label})` : ""}.
            </p>
          </div>
        </aside>

        <section className="rr-cast rr-glass" aria-label="Characters">
          <div className="rr-cast-title">
            <div className="rr-label">Characters</div>
            <span>{ok ? `${characters.length} known` : ""}</span>
          </div>
          {characters.length === 0 ? (
            <p className="rr-empty rr-inline">
              {ok ? "No characters on file yet. They appear once a watched episode introduces them." : ""}
            </p>
          ) : (
            <ul>
              {characters.map((c) => (
                <li key={c.id}>
                  <button>
                    <span className="rr-mono" aria-hidden="true">{c.initials}</span>
                    <span>
                      <span className="rr-nm">{c.name}</span>
                      {c.role && <><br /><span className="rr-rl">{c.role}</span></>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {view === "episodes" && (
          <section className="rr-episodes rr-glass" aria-label="Episodes">
            <div className="rr-panel-head">
              <h2>Episodes</h2>
              <button className="rr-btn" onClick={() => setView("board")}>Back to the board</button>
            </div>
            <div className="rr-episodes-body">
              {!ok ? (
                <p className="rr-empty">{canon ? "No data to show." : "Loading series data…"}</p>
              ) : (
                <div className="episodes">
                  {ok.groups.map((g) => (
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
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
