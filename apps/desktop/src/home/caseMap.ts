/**
 * Pure view model for the case map: where each case happened, the chronology over watched cases and the red string.
 * Everything comes from KnowledgeEngine views at one Progress, so nothing beyond progress can leak: a case, a
 * location, a person role or an arc item that is not visible at `p` is never read here.
 *
 * Claim conventions (all gated by the engine):
 *   part_of_case   location -> case (object = case entity)
 *   case_site      "true" on a location: the case's primary place
 *   coordinates    "lat,lon" (core predicate, read through getMap)
 *   role_in_case   person -> case (core predicate, read through getCaseFile)
 *   arc items      refEntity / refClaim that point at a case link the cases of one arc
 *
 * Place of a case: the visible location linked by a current `part_of_case` that has a current `case_site: "true"`
 * and coordinates; else the first linked location with coordinates (by introduction, then id); else none.
 */
import { inLanguage, type EntityId, type KnowledgeEngine, type Lang, type Progress as CoreProgress } from "@mentalist/core";
import { DEFAULT_LANG, episodeCode, valueIndex } from "./viewModel";

/** [lon, lat] */
export type Pos = [number, number];

export interface CasePlace { locationId: string; label: string; position: Pos }

export interface CaseStop {
  caseId: string;
  /** Episode code where the case is introduced, e.g. "1x02". */
  code: string;
  title: string;
  place: CasePlace | null;
}

export type LinkVia = "person" | "arc";

/** `a` is introduced before `b`. */
export interface CaseLink { a: string; b: string; via: LinkVia }

export interface CaseMapModel {
  /** Watched cases in episode order. */
  stops: CaseStop[];
  links: CaseLink[];
}

export interface RedLink extends CaseLink { from: Pos; to: Pos }

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function buildCaseMap(base: KnowledgeEngine, p: CoreProgress, lang: Lang = DEFAULT_LANG): CaseMapModel {
  const engine = inLanguage(base, lang);
  const claims = engine.listClaims(p);
  const values = valueIndex(claims);
  const entities = engine.listEntities(p);
  const intro = new Map(entities.map((e) => [e.id as string, e.introducedIn]));
  const cases = entities
    .filter((e) => e.kind === "case")
    .sort((a, b) => a.introducedIn - b.introducedIn || cmp(a.id, b.id));
  const caseIds = new Set(cases.map((c) => c.id as string));
  const episodes = engine.listEpisodes(p);
  const pins = new Map(engine.getMap(p).pins.map((x) => [x.entityId as string, [x.lon, x.lat] as Pos]));

  // location -> candidate places per case
  const candidates = new Map<string, string[]>();
  for (const c of claims) {
    if (c.predicate !== "part_of_case" || c.state !== "current" || !c.object) continue;
    if (!caseIds.has(c.object) || !pins.has(c.subject)) continue;
    const list = candidates.get(c.object) ?? [];
    if (!list.includes(c.subject)) list.push(c.subject);
    candidates.set(c.object, list);
  }
  const siteOf = (loc: string) => values.get(`${loc}\u0000case_site`) === "true";
  const order = (a: string, b: string) => (intro.get(a) ?? 0) - (intro.get(b) ?? 0) || cmp(a, b);

  const stops: CaseStop[] = cases.map((e) => {
    const locs = [...(candidates.get(e.id) ?? [])].sort(order);
    const loc = locs.find(siteOf) ?? locs[0];
    const position = loc ? pins.get(loc) : undefined;
    const ep = episodes[e.introducedIn - 1];
    return {
      caseId: e.id,
      code: ep ? episodeCode(ep.season, ep.number) : "",
      title: values.get(`${e.id}\u0000name`) ?? "",
      place: loc && position ? { locationId: loc, label: values.get(`${loc}\u0000name`) ?? "", position } : null,
    };
  });

  // Cases linked through a person (visible role_in_case) or an arc (visible arc item that points at a case).
  const rank = new Map(cases.map((c, i) => [c.id as string, i]));
  const pairs = new Map<string, LinkVia>();
  const addPair = (x: string, y: string, via: LinkVia) => {
    if (x === y) return;
    const [a, b] = (rank.get(x) ?? 0) < (rank.get(y) ?? 0) ? [x, y] : [y, x];
    const key = `${a}\u0000${b}`;
    if (!pairs.has(key)) pairs.set(key, via); // person links are added first and win
  };
  const group = (sets: Set<string>[], via: LinkVia) => {
    for (const s of sets) {
      const ids = [...s];
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) addPair(ids[i] as string, ids[j] as string, via);
    }
  };
  const byPerson = new Map<string, Set<string>>();
  for (const c of cases) {
    for (const r of engine.getCaseFile(p, c.id).roles) {
      if (r.state !== "current") continue;
      const s = byPerson.get(r.person) ?? new Set<string>();
      s.add(c.id);
      byPerson.set(r.person, s);
    }
  }
  group([...byPerson.values()], "person");
  const claimById = new Map(claims.map((c) => [c.id as string, c]));
  const arcSets: Set<string>[] = [];
  for (const arc of entities.filter((e) => e.kind === "arc")) {
    const s = new Set<string>();
    for (const item of engine.getArc(p, arc.id as EntityId).items) {
      const ref = item.refClaim ? claimById.get(item.refClaim) : undefined;
      for (const id of [item.refEntity as string | null, ref?.subject ?? null, ref?.object ?? null]) {
        if (id && caseIds.has(id)) s.add(id);
      }
    }
    arcSets.push(s);
  }
  group(arcSets, "arc");

  const links: CaseLink[] = [...pairs]
    .map(([key, via]) => {
      const [a, b] = key.split("\u0000") as [string, string];
      return { a, b, via };
    })
    .sort((x, y) => (rank.get(x.a) ?? 0) - (rank.get(y.a) ?? 0) || (rank.get(x.b) ?? 0) - (rank.get(y.b) ?? 0));
  return { stops, links };
}

/** Where the camera goes for a case: its place, or null (no fly, selection kept, no error). */
export function flyTarget(model: CaseMapModel, caseId: string): Pos | null {
  return model.stops.find((s) => s.caseId === caseId)?.place?.position ?? null;
}

/** Places of the watched cases up to chronology step `step` (inclusive), in order; cases without a place are skipped. */
export function chronologyPath(model: CaseMapModel, step: number): Pos[] {
  return model.stops.slice(0, step + 1).flatMap((s) => (s.place ? [s.place.position] : []));
}

/**
 * Red string: the chronological thread through case places plus links between placed cases that share a person or
 * an arc. With `step` (chronology mode) only cases up to that step take part; null means all watched cases.
 */
export function redString(model: CaseMapModel, step: number | null): { thread: Pos[]; links: RedLink[] } {
  const stops = step === null ? model.stops : model.stops.slice(0, step + 1);
  const at = new Map(stops.flatMap((s) => (s.place ? [[s.caseId, s.place.position] as const] : [])));
  const links = model.links.flatMap((l) => {
    const from = at.get(l.a);
    const to = at.get(l.b);
    return from && to ? [{ ...l, from, to }] : [];
  });
  return { thread: [...at.values()], links };
}
