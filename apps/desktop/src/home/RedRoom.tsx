import { useEffect, useMemo, useRef, useState } from "react";
import type { Canon } from "../data/canon";
import { formatNumber } from "../i18n/format";
import { isUiLang, translator, type StringKey, type UiLang } from "../i18n/strings";
import { parseProgressInput, type Progress } from "../state/progress";
import { Check, Open, SilCbi, SilJane, Smiley } from "./art";
import { Credits } from "./Credits";
import { chronologyPath, flyTarget, redString, type Pos } from "./caseMap";
import { moveIndex, pickerModel } from "./navigation";
import { RedMap } from "./RedMap";
import { characterSubtitle, resolveHome } from "./viewModel";
import "./redroom.css";

type View = "board" | "episodes" | "fans" | "credits" | "settings";

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

/** Roving tabindex for a list of buttons: one tab stop, arrows/Home/End move focus, Enter activates (native click). */
function useRoving(count: number, selected: number) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  // The tab stop is the item last moved to; before any move, the selected item (else the first).
  const stop = Math.min(cursor ?? (selected >= 0 ? selected : 0), Math.max(count - 1, 0));
  function onKeyDown(e: React.KeyboardEvent) {
    const i = refs.current.findIndex((b) => b === document.activeElement);
    if (i < 0) return;
    const next = moveIndex(e.key, i, count);
    if (next === null) return;
    e.preventDefault();
    refs.current[next]?.focus(); // onFocus moves the tab stop
  }
  return { refs, tabIndexOf: (i: number) => (i === stop ? 0 : -1), onKeyDown, setCursor };
}

interface Props {
  canon: Canon | null;
  loadError: boolean;
  progress: Progress;
  /** UI and canon language (Settings). */
  lang: UiLang;
  /** Persist the language. Returns false when it could not be saved (the UI still switches for this session). */
  onChangeLang: (next: UiLang) => boolean;
  /** Persist new progress. Returns an error key, or null on success. */
  onChangeProgress: (next: Progress) => "error.progressInvalid" | "error.progressSave" | null;
}

const LEGEND_KEY = {
  smiley: "legend.smiley",
  landmark: "legend.landmark",
  linked: "legend.linked",
  hover: "legend.hover",
} as const satisfies Record<string, StringKey>;

export function RedRoom({ canon, loadError, progress, lang, onChangeLang, onChangeProgress }: Props) {
  const t = useMemo(() => translator(lang), [lang]);
  const num = (n: number) => formatNumber(lang, n);
  // Peek is React state only: never persisted, reset on reload and on any progress change.
  const [peekWanted, setPeekWanted] = useState(false);
  const [view, setView] = useState<View>("board");
  const [selCase, setSelCase] = useState<string | null>(null);
  const [selPin, setSelPin] = useState<string | null>(null);
  const [season, setSeason] = useState(String(progress.season));
  const [episode, setEpisode] = useState(String(progress.episode));
  const [formError, setFormError] = useState<StringKey | null>(null);
  const [langError, setLangError] = useState(false);
  const [mapDown, setMapDown] = useState(false);
  const [chronoOn, setChronoOn] = useState(false);
  const [chronoStep, setChronoStep] = useState(0);
  const [redOn, setRedOn] = useState(false);
  const [focus, setFocus] = useState<{ position: Pos; seq: number } | null>(null);
  const reduced = useReducedMotion();

  const result = useMemo(
    () => (canon ? resolveHome(canon, progress, peekWanted, lang) : null),
    [canon, progress, peekWanted, lang],
  );
  const ok = result?.kind === "ok" ? result : null;
  const pins = ok?.model.pins ?? [];
  const cases = ok?.model.cases ?? [];
  const characters = ok?.model.characters ?? [];
  const legend = ok?.model.legend ?? [];
  const gate = ok?.gate;
  const peeking = gate?.peeking ?? false;

  // With nothing picked yet, the selected pin is the team's current base (where the camera opens).
  const baseId = result?.kind === "ok" ? result.base?.id ?? null : null;
  const pin = pins.find((p) => p.id === selPin) ?? pins.find((p) => p.id === baseId) ?? pins[0] ?? null;
  const caseSel = cases.find((c) => c.id === selCase)?.id ?? null;

  const caseMap = ok?.caseMap ?? null;
  const stops = caseMap?.stops ?? [];
  const step = Math.min(chronoStep, Math.max(stops.length - 1, 0));
  const stop = chronoOn ? stops[step] ?? null : null;
  const path = caseMap && chronoOn ? chronologyPath(caseMap, step) : [];
  const red = caseMap && redOn ? redString(caseMap, chronoOn ? step : null) : { thread: [], links: [] };
  const pickers = useMemo(() => pickerModel(ok?.groups ?? []), [ok?.groups]);
  const caseRoving = useRoving(cases.length, cases.findIndex((c) => c.id === caseSel));
  const chronoRoving = useRoving(stops.length, step);

  /** Select a case and fly to its place; a case without a place keeps the camera where it is (selection still changes). */
  function goToCase(id: string) {
    setSelCase(id);
    const position = caseMap ? flyTarget(caseMap, id) : null;
    if (position) setFocus({ position, seq: (focus?.seq ?? 0) + 1 });
  }
  function goToStep(i: number) {
    const next = Math.min(Math.max(i, 0), Math.max(stops.length - 1, 0));
    setChronoStep(next);
    const target = stops[next];
    if (target) goToCase(target.caseId);
  }
  function toggleChrono() {
    const on = !chronoOn;
    setChronoOn(on);
    if (on) goToStep(0);
  }
  function changeSeason(next: string) {
    setSeason(next);
    // keep the episode when the new season has it; otherwise start at its first episode
    const eps = pickers.episodes(Number(next));
    if (episode !== "end" && !eps.some((o) => o.value === episode)) setEpisode(eps[0]?.value ?? "1");
  }

  function save() {
    const next = parseProgressInput(season, episode);
    if (next === null) {
      setFormError("error.progressInvalid");
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
          <Smiley role="img" aria-label={t("brand.smileyAria")} />
          <h1 className="rr-wordmark">
            <span className="rr-title-light">The</span> <span className="rr-title-medium">Mentalist</span>
            <small>Archive</small>
          </h1>
        </div>
        <section className="rr-gate" aria-label={t("gate.aria")}>
          <div className="rr-gate-val">
            <span className="rr-label">{t("gate.watchedThrough")}</span>
            <b>{gate ? gate.label : "…"}</b>
          </div>
          <form className="rr-change" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <div className="rr-field">
              <label className="rr-label" htmlFor="rr-season">{t("gate.season")}</label>
              <select id="rr-season" value={season} onChange={(e) => changeSeason(e.target.value)}>
                {!pickers.seasons.includes(Number(season)) && <option value={season}>{season}</option>}
                {pickers.seasons.map((n) => <option key={n} value={String(n)}>{num(n)}</option>)}
              </select>
            </div>
            <div className="rr-field">
              <label className="rr-label" htmlFor="rr-episode">{t("gate.episode")}</label>
              <select id="rr-episode" value={episode} onChange={(e) => setEpisode(e.target.value)}>
                {pickers.episodes(Number(season)).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                <option value="end">{t("gate.endOfSeason")}</option>
              </select>
            </div>
            <button className="rr-btn" type="submit">{t("gate.change")}</button>
          </form>
          <button
            className="rr-btn" type="button" aria-pressed={peeking} aria-describedby="gateNote"
            disabled={!gate || (!gate.canPeek && !peeking)}
            onClick={() => setPeekWanted(!peekWanted)}
          >
            {peeking ? t("gate.endPeek") : t("gate.peek")}
          </button>
          {gate?.peeking && <span className="rr-peek-tag">{t("gate.peekTag")}</span>}
          <p className="rr-gate-note" id="gateNote" aria-live="polite">
            <strong>{t("gate.limited")}</strong>{" "}
            {gate?.peeking
              ? t("gate.peekingNote", { label: gate.peekLabel ?? "" })
              : t("gate.peekNote")}
          </p>
          {formError && <p className="rr-error" role="alert">{t(formError)}</p>}
        </section>
      </header>

      <nav className="rr-nav" aria-label={t("nav.aria")}>
        <ul>
          <li><button aria-current={view === "board" ? "page" : undefined} onClick={() => setView("board")}>{t("nav.board")}</button></li>
          <li><button aria-current={view === "episodes" ? "page" : undefined} onClick={() => setView("episodes")}>{t("nav.episodes")}</button></li>
          <li>
            <button aria-current={view === "fans" ? "page" : undefined} onClick={() => setView("fans")}>
              {t("nav.fans")} <span className="rr-noncanon">{t("nonCanon")}</span>
            </button>
          </li>
          <li><button aria-current={view === "credits" ? "page" : undefined} onClick={() => setView("credits")}>{t("nav.credits")}</button></li>
          <li><button aria-current={view === "settings" ? "page" : undefined} onClick={() => setView("settings")}>{t("nav.settings")}</button></li>
        </ul>
      </nav>

      <main>
        <h2 className="rr-sr">{t("board.heading")}</h2>
        <RedMap
          base={result?.kind === "ok" ? result.base?.position ?? null : null} pins={pins} selectedPin={pin?.id ?? null} linkedCase={caseSel}
          focus={focus} path={path} thread={red.thread} links={red.links}
          reducedMotion={reduced} ariaLabel={t("map.aria")} onUnavailable={() => setMapDown(true)} onSelectPin={setSelPin}
        />
        <div className="rr-tools rr-glass" role="group" aria-label={t("tools.aria")}>
          <button className="rr-btn" type="button" aria-pressed={chronoOn} onClick={toggleChrono}>{t("tools.chronology")}</button>
          <button className="rr-btn rr-btn-red" type="button" aria-pressed={redOn} onClick={() => setRedOn(!redOn)}>{t("tools.redString")}</button>
          {redOn && <span className="rr-tools-note">{t("redString.note")}</span>}
        </div>
        {chronoOn && (
          <section className="rr-chrono rr-glass" aria-label={t("chrono.aria")}>
            {stops.length === 0 ? (
              <p className="rr-empty rr-inline">{t("chrono.empty")}</p>
            ) : (
              <>
                <button className="rr-btn" type="button" disabled={step === 0} onClick={() => goToStep(step - 1)}>{t("chrono.prev")}</button>
                <ol className="rr-chrono-list" aria-label={t("chrono.list")} onKeyDown={chronoRoving.onKeyDown}>
                  {stops.map((s, i) => (
                    <li key={s.caseId}>
                      <button
                        ref={(el) => { chronoRoving.refs.current[i] = el; }} onFocus={() => chronoRoving.setCursor(i)} tabIndex={chronoRoving.tabIndexOf(i)}
                        aria-current={i === step ? "step" : undefined} title={s.title} onClick={() => goToStep(i)}
                      >
                        <span className="rr-ep">{s.code}</span>
                        <span className="rr-chrono-title">{s.title}</span>
                      </button>
                    </li>
                  ))}
                </ol>
                <button className="rr-btn" type="button" disabled={step >= stops.length - 1} onClick={() => goToStep(step + 1)}>{t("chrono.next")}</button>
                <span className="rr-chrono-step" role="status">
                  {t("chrono.step", { n: num(step + 1), total: num(stops.length) })}
                  {stop && !stop.place && <> · {t("chrono.noPlace")}</>}
                </span>
              </>
            )}
          </section>
        )}
        {mapDown && <p className="rr-map-down" role="status">{t("map.down")}</p>}
        <svg className="rr-grain" aria-hidden="true" focusable="false">
          <filter id="rr-noise"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch" /><feColorMatrix type="saturate" values="0" /></filter>
          <rect width="100%" height="100%" filter="url(#rr-noise)" />
        </svg>
        <div className="rr-vignette" />

        {loadError ? (
          <p className="rr-banner" role="alert">{t("error.load")}</p>
        ) : result?.kind === "not-found" ? (
          <p className="rr-banner" role="alert">{t("error.notFound")}</p>
        ) : result?.kind === "error" ? (
          <p className="rr-banner" role="alert">{t("error.read")}</p>
        ) : null}

        <aside className="rr-rail rr-glass" aria-label={t("cases.aria")}>
          <div className="rr-panel-head">
            <h2>{t("cases.heading")}</h2>
            <span>{ok ? t("episodes.watchedCount", { n: num(ok.model.watchedEpisodes), total: num(ok.model.totalEpisodes) }) : ""}</span>
          </div>
          {!ok ? (
            <p className="rr-empty">{canon || loadError ? t("common.noData") : t("common.loading")}</p>
          ) : cases.length === 0 ? (
            <div className="rr-empty">
              <strong>{t("cases.emptyTitle")}</strong>
              <p>{t("cases.emptyBody")}</p>
            </div>
          ) : (
            <ol className="rr-cases" aria-describedby="casesHint" onKeyDown={caseRoving.onKeyDown}>
              {cases.map((c, i) => (
                <li key={c.id}>
                  <button
                    className="rr-case" aria-current={caseSel === c.id} onClick={() => (caseSel === c.id ? setSelCase(null) : goToCase(c.id))}
                    ref={(el) => { caseRoving.refs.current[i] = el; }} onFocus={() => caseRoving.setCursor(i)} tabIndex={caseRoving.tabIndexOf(i)}
                  >
                    <span className={c.solved ? "rr-plate" : "rr-plate rr-open"} aria-hidden="true">
                      {c.solved ? (c.silhouette === "cbi" ? <SilCbi /> : <SilJane />) : <Open />}
                    </span>
                    <span>
                      <span className="rr-ep">{c.code}</span>
                      <span className="rr-title">{c.title}</span>
                      <span className="rr-status">{c.solved ? <><Check aria-hidden="true" />{t("cases.solved")}</> : t("cases.open")}</span>
                      {caseMap && !flyTarget(caseMap, c.id) && <span className="rr-status rr-noplace">{t("cases.noPlace")}</span>}
                      {peeking && c.code === gate?.peekLabel && <span className="rr-status rr-peeking">{t("gate.peekTag")}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
          <p className="rr-sr" id="casesHint">{t("cases.listHint")}</p>
        </aside>

        <aside className="rr-legend rr-glass" aria-label={t("legend.aria")}>
          <div className="rr-panel-head"><h2>{t("legend.heading")}</h2><span>{t("legend.tilt")}</span></div>
          <div className="rr-body">
            {legend.length === 0 ? (
              <div className="rr-empty rr-inline">
                <strong>{t("legend.emptyTitle")}</strong>
                <p>{t("legend.emptyBody")}</p>
              </div>
            ) : (
              <>
                <ul aria-label={t("legend.list")}>
                  {legend.map((l) => (
                    <li key={l.kind}>
                      {l.kind === "smiley" && <Smiley aria-hidden="true" />}
                      {l.kind === "landmark" && (
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21 V10 L12 4 L21 10 V21 Z" fill="#151110" stroke="#d9b25a" strokeWidth="1.6" /><path d="M8 21 V14 H16 V21 M12 4 V1.5" fill="none" stroke="#d9b25a" strokeWidth="1.4" /></svg>
                      )}
                      {l.kind === "linked" && <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="#d9b25a" strokeWidth="1.6" /></svg>}
                      {l.kind === "hover" && <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="#ece4d8" strokeWidth="1.6" strokeDasharray="3 3" /></svg>}
                      {t(LEGEND_KEY[l.kind])}
                    </li>
                  ))}
                </ul>
                {pin && (
                  <div className="rr-info" aria-live="polite">
                    <span className="rr-label">{t("legend.selected")}</span>
                    <h3>{pin.label}</h3>
                    {pin.description && <p>{pin.description}</p>}
                  </div>
                )}
                <ul className="rr-pinlist" aria-label={t("legend.pins")}>
                  {pins.map((p) => (
                    <li key={p.id}><button aria-pressed={p.id === pin?.id} onClick={() => setSelPin(p.id)}>{p.label}</button></li>
                  ))}
                </ul>
              </>
            )}
            <p className="rr-note">
              <strong>{t("legend.noteStrong")}</strong>{" "}
              {t("legend.noteBody", { now: gate ? t("legend.now", { label: gate.peekLabel ?? gate.label }) : "" })}
            </p>
          </div>
        </aside>

        <section className="rr-cast rr-glass" aria-label={t("cast.aria")}>
          <div className="rr-cast-title">
            <div className="rr-label">{t("cast.title")}</div>
            <span>{ok ? t("cast.known", { n: num(characters.length) }) : ""}</span>
          </div>
          {characters.length === 0 ? (
            <p className="rr-empty rr-inline">
              {ok ? t("cast.empty") : ""}
            </p>
          ) : (
            <ul>
              {characters.map((c) => (
                <li key={c.id}>
                  <button title={c.name}>
                    <span className="rr-mono" aria-hidden="true">{c.initials}</span>
                    <span className="rr-txt">
                      <span className="rr-nm" title={c.name}>{c.name}</span>
                      {characterSubtitle(c, lang) && <span className="rr-rl" title={characterSubtitle(c, lang) ?? undefined}>{characterSubtitle(c, lang)}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {view === "episodes" && (
          <section className="rr-episodes rr-glass" aria-label={t("episodes.aria")}>
            <div className="rr-panel-head">
              <h2>{t("nav.episodes")}</h2>
              <button className="rr-btn" onClick={() => setView("board")}>{t("common.back")}</button>
            </div>
            <div className="rr-episodes-body">
              {!ok ? (
                <p className="rr-empty">{canon ? t("common.noData") : t("common.loading")}</p>
              ) : (
                <div className="episodes">
                  {ok.groups.map((g) => (
                    <div key={g.season} className="season">
                      <h2>{t("episodes.season", { n: num(g.season) })}</h2>
                      <ol>
                        {g.episodes.map((e) => (
                          <li key={e.number} className={e.watched ? "ep" : "ep unwatched"}>
                            <span className="ep-num">{e.season}x{String(e.number).padStart(2, "0")}</span>
                            <span className="ep-body">
                              <span className="ep-title">{e.title}</span>
                              {!e.watched && <span className="ep-flag">{t("episodes.notWatched")}</span>}
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

        {view === "fans" && (
          <section className="rr-episodes rr-glass" aria-label={t("fans.aria")}>
            <div className="rr-panel-head">
              <h2>{t("nav.fans")} <span className="rr-noncanon">{t("nonCanon")}</span></h2>
              <button className="rr-btn" onClick={() => setView("board")}>{t("common.back")}</button>
            </div>
            <div className="rr-episodes-body">
              {!ok ? (
                <p className="rr-empty">{canon ? t("common.noData") : t("common.loading")}</p>
              ) : ok.fans.count === 0 ? (
                <div className="rr-empty">
                  <strong>{t("fans.emptyTitle")}</strong>
                  <p>{t("fans.emptyBody")}</p>
                </div>
              ) : (
                <div className="rr-fans">
                  <p className="rr-note">{t(ok.fans.count === 1 ? "fans.countOne" : "fans.countMany", { n: num(ok.fans.count) })}</p>
                  <ul>
                    {ok.fans.notes.map((n) => (
                      <li key={n.id} className="rr-fan">
                        <div className="rr-fan-head">
                          <span className="rr-noncanon">{t("nonCanon")}</span>
                          <span className="rr-ep">{n.code}</span>
                        </div>
                        <h3>{n.title}</h3>
                        <p className="rr-fan-body">{n.body}</p>
                        <p className="rr-fan-meta">
                          {t("fans.source")} <span className="rr-url">{n.sourceUrl}</span><br />
                          {t("fans.author")} {t("fans.authorName")} · {t("fans.licence")}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
        )}

        {view === "credits" && (
          <section className="rr-episodes rr-glass" aria-label={t("credits.aria")}>
            <div className="rr-panel-head">
              <h2>{t("nav.credits")}</h2>
              <button className="rr-btn" onClick={() => setView("board")}>{t("common.back")}</button>
            </div>
            <div className="rr-episodes-body"><Credits lang={lang} /></div>
          </section>
        )}

        {view === "settings" && (
          <section className="rr-episodes rr-glass" aria-label={t("settings.aria")}>
            <div className="rr-panel-head">
              <h2>{t("settings.heading")}</h2>
              <button className="rr-btn" onClick={() => setView("board")}>{t("common.back")}</button>
            </div>
            <div className="rr-episodes-body">
              <div className="rr-settings">
                <section aria-labelledby="st-lang">
                  <h3 id="st-lang">{t("settings.languageHead")}</h3>
                  <div className="rr-field">
                    <label className="rr-label" htmlFor="rr-lang">{t("settings.languageLabel")}</label>
                    <select
                      id="rr-lang" value={lang}
                      onChange={(e) => {
                        const next = e.target.value;
                        if (isUiLang(next)) setLangError(!onChangeLang(next));
                      }}
                    >
                      <option value="es">{t("settings.langEs")}</option>
                      <option value="en">{t("settings.langEn")}</option>
                    </select>
                  </div>
                  <p className="rr-note">{t("settings.languageHelp")}</p>
                  {langError && <p className="rr-error" role="alert">{t("settings.saveError")}</p>}
                </section>
                {/* Phase 3: map options (2D/3D, style) go in their own section here. */}
                <section aria-labelledby="st-more">
                  <h3 id="st-more">{t("settings.moreHead")}</h3>
                  <p className="rr-note">{t("settings.moreBody")}</p>
                </section>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
