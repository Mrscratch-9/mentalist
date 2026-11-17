import { useEffect, useMemo, useState } from "react";
import { Check, Lock, SilCbi, SilJane, Smiley } from "./art";
import { CHARACTERS, SEASON_LENGTH, epLabel, knownAt } from "./demoData";
import { RedMap } from "./RedMap";
import "./redroom.css";

const NAV = ["Cases", "Characters", "Map", "Red John", "Episodes", "Geek / Fans"];
const EPISODE_CHOICES = Array.from({ length: SEASON_LENGTH }, (_, i) => i + 1);

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

export function RedRoom() {
  // Progress and peek are React state only: never persisted, reset on reload.
  const [progress, setProgress] = useState(5);
  const [peek, setPeek] = useState(false);
  const [selCase, setSelCase] = useState<number | null>(null);
  const [selPin, setSelPin] = useState("hq");
  const reduced = useReducedMotion();

  const canPeek = progress < SEASON_LENGTH;
  const peeking = peek && canPeek;
  const effective = peeking ? progress + 1 : progress;
  const known = useMemo(() => knownAt(effective), [effective]);
  const caseSel = selCase !== null && selCase <= effective ? selCase : null;
  const pin = known.pins.find((p) => p.id === selPin) ?? known.pins[0];

  const changeProgress = (n: number) => {
    setProgress(n);
    setPeek(false); // a progress change ends any peek so progress + 1 stays consistent
  };

  return (
    <div className="redroom">
      <header className="rr-top">
        <div className="rr-brand">
          <Smiley role="img" aria-label="Red John smiley mark" />
          <div className="rr-wordmark">The Mentalist<small>Investigation board</small></div>
        </div>
        <section className="rr-gate" aria-label="Progress gate">
          <div className="rr-gate-val">
            <span className="rr-label">Watched through</span>
            <b>{epLabel(progress)}</b>
          </div>
          <div className="rr-field">
            <label className="rr-label" htmlFor="progress">Change</label>
            <select id="progress" value={progress} aria-describedby="gateNote" onChange={(e) => changeProgress(Number(e.target.value))}>
              {EPISODE_CHOICES.map((n) => <option key={n} value={n}>{epLabel(n)}</option>)}
            </select>
          </div>
          <button className="rr-btn" aria-pressed={peeking} disabled={!canPeek} onClick={() => setPeek(!peek)}>
            {peeking ? "End peek" : "Peek next episode"}
          </button>
          {peeking && <span className="rr-peek-tag">Peek · temporary</span>}
          <p className="rr-gate-note" id="gateNote">
            <strong>Everything here is limited to your progress.</strong>{" "}
            {peeking ? `Peeking at E${effective} — resets on reload, progress unchanged.` : "Peek is temporary and never saved."}
          </p>
        </section>
      </header>

      <nav className="rr-nav" aria-label="Browse by object">
        <ul>
          {NAV.map((name) => (
            <li key={name}>
              <button aria-current={name === "Cases" ? "page" : undefined}>
                {name === "Red John" && <Smiley aria-hidden="true" />}
                {name}
                {name === "Red John" && <span className="rr-plain">(arc)</span>}
                {name === "Geek / Fans" && <span className="rr-noncanon">NON-CANON</span>}
              </button>
            </li>
          ))}
        </ul>
        <div className="rr-demo-flag" role="status"><i />Demo data</div>
      </nav>

      <main>
        <h1 className="rr-sr">Investigation board: cases, Sacramento map and characters</h1>
        <RedMap pins={known.pins} selectedPin={pin.id} linkedEpisode={caseSel} reducedMotion={reduced} onSelectPin={setSelPin} />
        <svg className="rr-grain" aria-hidden="true" focusable="false">
          <filter id="rr-noise"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch" /><feColorMatrix type="saturate" values="0" /></filter>
          <rect width="100%" height="100%" filter="url(#rr-noise)" />
        </svg>
        <div className="rr-vignette" />

        <aside className="rr-rail rr-glass" aria-label="Case list">
          <div className="rr-panel-head"><h2>Cases · Season 1</h2><span>{Math.min(progress, SEASON_LENGTH)} of {SEASON_LENGTH} watched</span></div>
          <ol className="rr-cases">
            {known.episodes.map((e) => (
              <li key={e.n}>
                {e.solved ? (
                  <button className="rr-case" aria-current={caseSel === e.n} onClick={() => setSelCase(caseSel === e.n ? null : e.n)}>
                    <span className="rr-plate" aria-hidden="true">{e.silhouette === "cbi" ? <SilCbi /> : <SilJane />}</span>
                    <span>
                      <span className="rr-ep">{epLabel(e.n)}</span>
                      <span className="rr-title">{e.title}</span>
                      <span className="rr-status"><Check aria-hidden="true" />Solved</span>
                      {peeking && e.n === effective && <span className="rr-status rr-peeking">Peeking · temporary</span>}
                    </span>
                  </button>
                ) : (
                  <div className="rr-case rr-locked">
                    <span className="rr-plate" aria-hidden="true"><Lock /></span>
                    <span>
                      <span className="rr-ep">{epLabel(e.n)}</span>
                      <span className="rr-title">{e.title}</span>
                      <span className="rr-status">Not yet watched</span>
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </aside>

        <aside className="rr-legend rr-glass" aria-label="Map legend and selection">
          <div className="rr-panel-head"><h2>Sacramento · 3D map</h2><span>Tilt 58° · demo</span></div>
          <div className="rr-body">
            <ul aria-label="Legend">
              <li><Smiley aria-hidden="true" />Red John smiley — where he appeared (demo)</li>
              <li>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21 V10 L12 4 L21 10 V21 Z" fill="#151110" stroke="#d9b25a" strokeWidth="1.6" /><path d="M8 21 V14 H16 V21 M12 4 V1.5" fill="none" stroke="#d9b25a" strokeWidth="1.4" /></svg>
                Landmark — non-spoiler place
              </li>
              <li><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="#d9b25a" strokeWidth="1.6" /></svg>Gold ring — linked to the selected case</li>
              <li><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="#ece4d8" strokeWidth="1.6" strokeDasharray="3 3" /></svg>Dashed ring — hover</li>
            </ul>
            <div className="rr-info" aria-live="polite">
              <span className="rr-label">Selected pin</span>
              <h3>{pin.label}</h3>
              <p>{pin.description}</p>
            </div>
            <ul className="rr-pinlist" aria-label="Pins on the map">
              {known.pins.map((p) => (
                <li key={p.id}><button aria-pressed={p.id === pin.id} onClick={() => setSelPin(p.id)}>{p.label}</button></li>
              ))}
            </ul>
            <p className="rr-note"><strong>Pins follow your progress.</strong> Only places from episodes you have watched appear (now {epLabel(effective)}). Scene pins are demo data.</p>
          </div>
        </aside>

        <section className="rr-cast rr-glass" aria-label="Characters">
          <div className="rr-cast-title"><div className="rr-label">Characters</div><span>Premise only</span></div>
          <ul>
            {CHARACTERS.map((c) => (
              <li key={c.name}>
                <button>
                  <span className="rr-mono" aria-hidden="true">{c.initials}</span>
                  <span><span className="rr-nm">{c.name}</span><br /><span className="rr-rl">{c.role}</span></span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
