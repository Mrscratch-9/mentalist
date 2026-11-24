/**
 * Pure view models for the Red room home. Everything here is derived from
 * KnowledgeEngine views at one Progress value: nothing reads tables directly
 * and nothing is invented. Counts are lengths of the visible rows (L6), pins
 * come from getMap (L9). Missing data gives empty lists, never placeholders.
 *
 * Claim conventions the home reads (all gated by the engine like any claim):
 *   name / description / role      value claims on any visible entity
 *   coordinates                    pins (core predicate)
 *   red_john_smiley                marks a pin as a Red John smiley
 *   part_of_case                   pin -> case link (object = case entity)
 *   role_in_case                   case file roles (core predicate)
 *   recurring                      "true" on a person puts them in the characters strip
 *   team_base                      "true" on a location marks the team's current base (map camera, see currentBase)
 */
import {
  NotFoundError, peek,
  type ClaimView, type EntityId, type EntityView, type KnowledgeEngine, type Progress as CoreProgress,
  type SqlDriver,
} from "@mentalist/core";
import { listBySeason, toCoreProgress, type SeasonGroup } from "../state/coreProgress";
import type { Progress } from "../state/progress";

export type PinKind = "smiley" | "landmark";
export type Silhouette = "jane" | "cbi";

export interface PinModel {
  id: string;
  label: string;
  kind: PinKind;
  /** [lon, lat] */
  position: [number, number];
  caseId: string | null;
  description: string;
}

export interface CaseModel {
  id: string;
  /** Episode code where the case is introduced, e.g. "1x02". */
  code: string;
  title: string;
  solved: boolean;
  silhouette: Silhouette;
}

export interface CharacterModel {
  id: string;
  name: string;
  role: string | null;
  initials: string;
}

export type LegendKind = "smiley" | "landmark" | "linked" | "hover";
export interface LegendItem { kind: LegendKind }

export interface HomeModel {
  pins: PinModel[];
  cases: CaseModel[];
  characters: CharacterModel[];
  legend: LegendItem[];
  watchedEpisodes: number;
  totalEpisodes: number;
}

const byIntro = (a: EntityView, b: EntityView) =>
  a.introducedIn - b.introducedIn || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Current (not discarded) visible value claims, first per subject and predicate. */
function valueIndex(claims: ClaimView[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of claims) {
    if (c.state !== "current" || c.value === null) continue;
    const key = `${c.subject}\u0000${c.predicate}`;
    if (!out.has(key)) out.set(key, c.value);
  }
  return out;
}

const initialsOf = (name: string): string =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => [...w][0]?.toUpperCase() ?? "").join("");

export function episodeCode(season: number, number: number): string {
  return `${season}x${String(number).padStart(2, "0")}`;
}

export function buildHomeModel(engine: KnowledgeEngine, p: CoreProgress): HomeModel {
  const episodes = engine.listEpisodes(p);
  const claims = engine.listClaims(p);
  const values = valueIndex(claims);
  const entities = engine.listEntities(p);
  const intro = new Map(entities.map((e) => [e.id as string, e]));
  const val = (id: EntityId, predicate: string) => values.get(`${id}\u0000${predicate}`) ?? null;

  const smileyEntities = new Set(
    claims.filter((c) => c.predicate === "red_john_smiley" && c.state === "current").map((c) => c.subject as string),
  );
  const pinCase = new Map<string, string>();
  const visibleCases = new Set(entities.filter((e) => e.kind === "case").map((e) => e.id as string));
  for (const c of claims) {
    if (c.predicate === "part_of_case" && c.state === "current" && c.object && visibleCases.has(c.object)) {
      if (!pinCase.has(c.subject)) pinCase.set(c.subject, c.object);
    }
  }

  const pins: PinModel[] = engine
    .getMap(p).pins
    .map((pin) => ({ pin, e: intro.get(pin.entityId) }))
    .filter((x): x is { pin: (typeof x)["pin"]; e: EntityView } => x.e !== undefined)
    .sort((a, b) => byIntro(a.e, b.e))
    .map(({ pin }) => ({
      id: pin.entityId,
      label: val(pin.entityId, "name") ?? "Unnamed place",
      kind: smileyEntities.has(pin.entityId) ? ("smiley" as const) : ("landmark" as const),
      position: [pin.lon, pin.lat] as [number, number],
      caseId: pinCase.get(pin.entityId) ?? null,
      description: val(pin.entityId, "description") ?? "",
    }));

  const cases: CaseModel[] = entities
    .filter((e) => e.kind === "case")
    .sort(byIntro)
    .map((e) => {
      const file = engine.getCaseFile(p, e.id);
      const current = file.roles.filter((r) => r.state === "current");
      const ep = episodes[e.introducedIn - 1];
      return {
        id: e.id,
        code: ep ? episodeCode(ep.season, ep.number) : "",
        title: val(e.id, "name") ?? "Untitled case",
        // A case is solved only when the show confirms who did it, not on a suspicion.
        solved: current.some((r) => r.role === "perpetrator" && r.status === "confirmed"),
        silhouette: current.filter((r) => r.role === "investigator").length >= 2 ? "cbi" : "jane",
      };
    });

  const characters: CharacterModel[] = entities
    .filter((e) => e.kind === "person" && val(e.id, "recurring") === "true")
    .sort(byIntro)
    .map((e) => {
      const name = val(e.id, "name") ?? "Unnamed";
      return { id: e.id, name, role: val(e.id, "role"), initials: initialsOf(name) };
    });

  const legend: LegendItem[] = [];
  if (pins.some((x) => x.kind === "smiley")) legend.push({ kind: "smiley" });
  if (pins.some((x) => x.kind === "landmark")) legend.push({ kind: "landmark" });
  if (pins.some((x) => x.caseId !== null)) legend.push({ kind: "linked" });
  if (pins.length > 0) legend.push({ kind: "hover" });

  return {
    pins, cases, characters, legend,
    watchedEpisodes: episodes.filter((e) => e.watched).length,
    totalEpisodes: episodes.length,
  };
}

export interface BaseModel {
  id: string;
  /** [lon, lat] */
  position: [number, number];
}

/**
 * The team's current base at progress `p`: the visible location with a current `team_base` claim
 * (value "true") and valid coordinates. A superseded base claim does not count. With several, the most
 * recently revealed wins. Null when there is none (the map falls back to Sacramento).
 */
export function currentBase(engine: KnowledgeEngine, p: CoreProgress): BaseModel | null {
  const kinds = new Map(engine.listEntities(p).map((e) => [e.id as string, e.kind]));
  const pins = new Map(engine.getMap(p).pins.map((x) => [x.entityId as string, x]));
  const bases = engine
    .listClaims(p, { predicate: "team_base" })
    .filter((c) => c.state === "current" && c.value === "true" && kinds.get(c.subject) === "location" && pins.has(c.subject))
    .sort((a, b) => b.revealedIn - a.revealedIn || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const top = bases[0];
  const pin = top && pins.get(top.subject);
  return top && pin ? { id: top.subject, position: [pin.lon, pin.lat] } : null;
}

export interface GateModel {
  /** Label of the owner's persisted progress, e.g. "6x09". */
  label: string;
  peeking: boolean;
  canPeek: boolean;
  /** Label of the peeked episode while peeking. */
  peekLabel: string | null;
}

export type HomeResult =
  | { kind: "ok"; model: HomeModel; gate: GateModel; groups: SeasonGroup[]; base: BaseModel | null }
  | { kind: "not-found" }
  | { kind: "error" };

function labelAt(engine: KnowledgeEngine, p: CoreProgress): string {
  const ep = engine.listEpisodes(p)[p.epIndex - 1];
  return ep && ep.watched ? episodeCode(ep.season, ep.number) : "Nothing yet";
}

/**
 * Resolve the stored progress, optionally peek (p+1, held by the caller and
 * never persisted here), and build everything the home needs from that one value.
 */
export function resolveHome(
  canon: { db: SqlDriver; engine: KnowledgeEngine },
  stored: Progress,
  wantPeek: boolean,
): HomeResult {
  try {
    const base = toCoreProgress(canon.db, stored);
    const total = canon.engine.listEpisodes(base).length;
    const canPeek = base.epIndex < total;
    const peeking = wantPeek && canPeek;
    const eff = peeking ? peek(base) : base;
    return {
      kind: "ok",
      model: buildHomeModel(canon.engine, eff),
      groups: listBySeason(canon.engine, eff),
      base: currentBase(canon.engine, eff),
      gate: {
        label: labelAt(canon.engine, base),
        peeking,
        canPeek,
        peekLabel: peeking ? labelAt(canon.engine, eff) : null,
      },
    };
  } catch (e) {
    if (e instanceof NotFoundError) return { kind: "not-found" };
    console.error("Series data query failed:", e instanceof Error ? e.name : "unknown error");
    return { kind: "error" };
  }
}
