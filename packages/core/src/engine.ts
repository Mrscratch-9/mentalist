/**
 * The knowledge engine ("what is known at episode N", design §4).
 *
 * Every query takes a `Progress` as its FIRST argument and applies the same
 * visibility rules. Nothing outside this package should run SQL on the tables.
 *
 * Visibility rules (viewer time):
 *  - entity:  introduced_in <= p
 *  - claim:   revealed_in <= p AND subject visible AND (object visible if any)
 *  - supersession is shown only once superseded_in <= p (no hint before),
 *    and `replacedBy` is only given when the replacing claim is itself visible
 *  - episode: unwatched (ep_index > p) exposes only season, number, title, synopsis
 *  - arc item: revealed_in <= p AND its referenced claim/entity visible; positions are renumbered
 *  - theory:  spoils_up_to <= p (always flagged non-canon)
 *  - translations (T1a): a text field is returned in the engine's language when a translation exists, else in
 *    English, and the *Lang flag of each text says which. A translation is read only through the row it
 *    belongs to, so it is exactly as visible as that row (translations of hidden items are never returned)
 *  - not-found is uniform for hidden and nonexistent (NotFoundError, constant message)
 *  - search ranks by reveal order, not bm25 (bm25 uses corpus-wide statistics that
 *    would depend on hidden rows); in a non-English language it also matches the translated text
 */
import type { SqlDriver, SqlValue } from "./driver.ts";
import { InvalidInputError, NotFoundError } from "./errors.ts";
import { assertProgress, progress, type Progress } from "./progress.ts";
import {
  COORDINATES, ENTITY_KINDS, ROLE_IN_CASE,
  BASE_LANG, NON_TEXT_PREDICATES, type CaseRole, type ClaimId, type ClaimStatus, type EntityId, type EntityKind, type TheoryId,
} from "./types.ts";

// ---------- views (what callers receive) ----------

/** Language code of a text ("en", "es"). */
export type Lang = string;

export interface EntityView { id: EntityId; kind: EntityKind; introducedIn: number }

export interface ClaimView {
  id: ClaimId;
  subject: EntityId;
  predicate: string;
  object: EntityId | null;
  value: string | null;
  revealedIn: number;
  /** Status as stored. A superseded claim keeps it; see `state`. */
  status: ClaimStatus;
  /** "discarded" only once p >= superseded_in. */
  state: "current" | "discarded";
  /** null until superseded_in <= p. `replacedBy` is null if the replacing claim is not visible. */
  supersession: { discardedIn: number; replacedBy: ClaimId | null } | null;
  sourceId: string;
  note: string;
  /** Language of `value` / `note` as returned ("en" when no translation exists). */
  valueLang: Lang;
  noteLang: Lang;
}

export interface EntityDetail extends EntityView { claims: ClaimView[] }

export type EpisodeView =
  | ({ watched: true; epIndex: number; season: number; number: number; title: string; synopsis: string; details: string } & EpisodeLangs)
  | ({ watched: false; season: number; number: number; title: string; synopsis: string } & EpisodeLangs);

/** Language of the returned title / synopsis (`details` is never translated). */
export interface EpisodeLangs { titleLang: Lang; synopsisLang: Lang }

export interface SearchResult {
  /** Number of VISIBLE hits (ignores `limit`). */
  total: number;
  /** `lang`: language of the snippet. */
  hits: Array<{ claimId: ClaimId; subject: EntityId; snippet: string; lang: Lang }>;
}

export interface GraphView {
  /** Only entities touching a visible edge. `degree` counts the visible edges listed. */
  nodes: Array<{ id: EntityId; kind: EntityKind; degree: number }>;
  edges: Array<{
    claimId: ClaimId; from: EntityId; to: EntityId; predicate: string;
    state: "current" | "discarded";
  }>;
}

export interface MapView {
  pins: Array<{ entityId: EntityId; claimId: ClaimId; lat: number; lon: number }>;
  filters: { kinds: EntityKind[] };
}

export interface CaseFileView {
  case: EntityView;
  roles: Array<{
    claimId: ClaimId; person: EntityId; role: CaseRole | string; revealedIn: number;
    status: ClaimStatus; state: "current" | "discarded"; supersession: ClaimView["supersession"];
  }>;
  claims: ClaimView[];
}

export interface ArcView {
  arc: EntityView;
  items: Array<{
    /** 1..n among visible items (stored order values are never exposed). */
    position: number; narrative: string; revealedIn: number;
    refClaim: ClaimId | null; refEntity: EntityId | null;
  }>;
}

export interface TheoryView {
  id: TheoryId; title: string; body: string; sourceUrl: string; authorHandle: string | null;
  spoilsUpTo: number; tags: string[];
  /** Language of `title` / `body` as returned. */
  titleLang: Lang; bodyLang: Lang;
  /** Always false: theories are never canon. */
  canon: false;
}

// ---------- SQL building blocks (internal) ----------

/** ?1 is always the progress epIndex. */
const ENTITY_VISIBLE = (a: string) => `${a}.introduced_in <= ?1`;
const CLAIM_VISIBLE = (a: string) =>
  `(${a}.revealed_in <= ?1
    AND EXISTS (SELECT 1 FROM entity vs WHERE vs.id = ${a}.subject AND ${ENTITY_VISIBLE("vs")})
    AND (${a}.object_id IS NULL
         OR EXISTS (SELECT 1 FROM entity vo WHERE vo.id = ${a}.object_id AND ${ENTITY_VISIBLE("vo")})))`;

/** Language codes are validated (`normalizeLang`) before they reach SQL, so inlining them is safe. */
const trText = (lang: Lang, targetId: string, field: string): string =>
  lang === BASE_LANG
    ? "NULL"
    : `(SELECT x.text FROM translation x WHERE x.target_id = ${targetId} AND x.field = '${field}' AND x.lang = '${lang}')`;

const NON_TEXT_SQL = NON_TEXT_PREDICATES.map((x) => `'${x}'`).join(",");
const trValue = (lang: Lang): string =>
  lang === BASE_LANG ? "NULL" : `CASE WHEN c.predicate IN (${NON_TEXT_SQL}) THEN NULL ELSE ${trText(lang, "c.id", "value")} END`;

const claimCols = (lang: Lang) => `c.id, c.subject, c.predicate, c.object_id,
  COALESCE(${trValue(lang)}, c.value) AS value, (${trValue(lang)}) IS NOT NULL AS value_tr,
  c.revealed_in, c.status, c.source_id,
  COALESCE(${trText(lang, "c.id", "note")}, c.note) AS note, (${trText(lang, "c.id", "note")}) IS NOT NULL AS note_tr,
  CASE WHEN c.superseded_in IS NOT NULL AND c.superseded_in <= ?1 THEN c.superseded_in END AS sup_in,
  CASE WHEN c.superseded_in IS NOT NULL AND c.superseded_in <= ?1
       THEN (SELECT b.id FROM claim b WHERE b.id = c.superseded_by AND ${CLAIM_VISIBLE("b")}) END AS sup_by`;

interface ClaimRow {
  id: string; subject: string; predicate: string; object_id: string | null; value: string | null;
  revealed_in: number; status: ClaimStatus; source_id: string; note: string;
  value_tr: number; note_tr: number;
  sup_in: number | null; sup_by: string | null;
}

const toClaim = (r: ClaimRow, lang: Lang): ClaimView => ({
  id: r.id as ClaimId,
  subject: r.subject as EntityId,
  predicate: r.predicate,
  object: r.object_id as EntityId | null,
  value: r.value,
  revealedIn: r.revealed_in,
  status: r.status,
  state: r.sup_in === null ? "current" : "discarded",
  supersession: r.sup_in === null ? null : { discardedIn: r.sup_in, replacedBy: r.sup_by as ClaimId | null },
  sourceId: r.source_id,
  note: r.note,
  valueLang: r.value_tr ? lang : BASE_LANG,
  noteLang: r.note_tr ? lang : BASE_LANG,
});

/** "es", "es-MX", "ES" -> "es". Anything else is invalid (the code is inlined in SQL, so it must be strict). */
function normalizeLang(lang: unknown): Lang {
  const m = typeof lang === "string" ? /^([A-Za-z]{2,3})(?:[-_][A-Za-z0-9]{2,8})*$/.exec(lang) : null;
  if (!m) throw new InvalidInputError("argument");
  return m[1]!.toLowerCase();
}

interface EntityRow { id: string; kind: EntityKind; introduced_in: number }
const toEntity = (r: EntityRow): EntityView => ({
  id: r.id as EntityId, kind: r.kind, introducedIn: r.introduced_in,
});

const notFound = (): never => { throw new NotFoundError(); };

/** Turn free text into a safe FTS5 query: quoted AND-ed tokens, never user syntax. */
function ftsQuery(text: string): string | null {
  const tokens = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return tokens.length ? tokens.map((t) => `"${t}"`).join(" ") : null;
}

// ---------- progress resolution (user state stores season + episode) ----------

/** Resolve the user's `{season, episode}` to a global-ep_index Progress. */
export function resolveProgress(db: SqlDriver, ref: { season: number; episode: number }): Progress {
  const row = db.get<{ ep_index: number }>(
    "SELECT ep_index FROM episode WHERE season = ?1 AND number = ?2", [ref.season, ref.episode],
  );
  return row ? progress(row.ep_index) : notFound();
}

/** Progress for "watched through the last episode of `season`" (inclusive). */
export function endOfSeason(db: SqlDriver, season: number): Progress {
  const row = db.get<{ m: number | null }>("SELECT MAX(ep_index) AS m FROM episode WHERE season = ?1", [season]);
  return row && row.m !== null ? progress(row.m) : notFound();
}

// ---------- the engine ----------

export class KnowledgeEngine {
  private readonly db: SqlDriver;
  private readonly language: Lang;

  /**
   * `lang` (default "en") is the language of every text this engine returns; a region tag is reduced to its base
   * language ("es-MX" -> "es"). Use `inLanguage(engine, lang)` to get a sibling engine on the same database.
   */
  constructor(db: SqlDriver, lang: Lang = BASE_LANG) {
    this.db = db;
    this.language = normalizeLang(lang);
  }

  /** The language of the texts this engine returns. */
  get lang(): Lang {
    return this.language;
  }

  private all<T>(p: Progress, sql: string, params: SqlValue[] = []): T[] {
    return this.db.all<T>(sql, [assertProgress(p), ...params]);
  }

  private one<T>(p: Progress, sql: string, params: SqlValue[] = []): T | undefined {
    return this.db.get<T>(sql, [assertProgress(p), ...params]);
  }

  /** Visible entities, optionally of one kind. Ordered by id. */
  listEntities(p: Progress, kind?: EntityKind): EntityView[] {
    if (kind !== undefined && !ENTITY_KINDS.includes(kind)) throw new InvalidInputError("argument");
    const rows = this.all<EntityRow>(
      p,
      `SELECT e.id, e.kind, e.introduced_in FROM entity e
       WHERE ${ENTITY_VISIBLE("e")} AND (?2 IS NULL OR e.kind = ?2) ORDER BY e.id`,
      [kind ?? null],
    );
    return rows.map(toEntity);
  }

  /** One visible entity with its visible claims. NotFoundError if hidden or nonexistent. */
  getEntity(p: Progress, id: EntityId): EntityDetail {
    const row = this.one<EntityRow>(
      p, `SELECT e.id, e.kind, e.introduced_in FROM entity e WHERE e.id = ?2 AND ${ENTITY_VISIBLE("e")}`, [id],
    );
    if (!row) return notFound();
    return { ...toEntity(row), claims: this.listClaims(p, { subject: id }) };
  }

  /** Visible entity counts per kind (every kind present; zero when none visible). */
  entityCounts(p: Progress): Record<EntityKind, number> {
    const out = Object.fromEntries(ENTITY_KINDS.map((k) => [k, 0])) as Record<EntityKind, number>;
    const rows = this.all<{ kind: EntityKind; n: number }>(
      p, `SELECT e.kind, COUNT(*) AS n FROM entity e WHERE ${ENTITY_VISIBLE("e")} GROUP BY e.kind`,
    );
    for (const r of rows) out[r.kind] = r.n;
    return out;
  }

  /** Visible claims, optionally filtered by subject and/or predicate. Ordered by id. */
  listClaims(p: Progress, filter: { subject?: EntityId; predicate?: string } = {}): ClaimView[] {
    const rows = this.all<ClaimRow>(
      p,
      `SELECT ${claimCols(this.language)} FROM claim c
       WHERE ${CLAIM_VISIBLE("c")} AND (?2 IS NULL OR c.subject = ?2) AND (?3 IS NULL OR c.predicate = ?3)
       ORDER BY c.id`,
      [filter.subject ?? null, filter.predicate ?? null],
    );
    return rows.map((r) => toClaim(r, this.language));
  }

  /** One visible claim. NotFoundError if hidden or nonexistent. */
  getClaim(p: Progress, id: ClaimId): ClaimView {
    const row = this.one<ClaimRow>(
      p, `SELECT ${claimCols(this.language)} FROM claim c WHERE c.id = ?2 AND ${CLAIM_VISIBLE("c")}`, [id],
    );
    return row ? toClaim(row, this.language) : notFound();
  }

  /** Number of visible claims. */
  claimCount(p: Progress): number {
    return this.one<{ n: number }>(p, `SELECT COUNT(*) AS n FROM claim c WHERE ${CLAIM_VISIBLE("c")}`)?.n ?? 0;
  }

  /**
   * Full-text search over visible claims. Filtering happens in the same query as the
   * match; `total` and snippets come only from visible rows. Query text is treated as
   * plain words (AND), never as FTS syntax.
   */
  search(p: Progress, text: string, limit = 20): SearchResult {
    const q = ftsQuery(String(text));
    const lim = Math.max(0, Math.min(1000, Math.trunc(Number(limit)) || 0));
    if (assertProgress(p) < 0 || q === null) return { total: 0, hits: [] };
    const lang = this.language;
    const english = "c.id IN (SELECT claim_id FROM claim_fts WHERE claim_fts MATCH ?2)";
    const translated = lang === BASE_LANG
      ? ""
      : ` OR c.id IN (SELECT claim_id FROM translation_fts WHERE translation_fts MATCH ?2 AND lang = '${lang}')`;
    const from = `FROM claim c WHERE (${english}${translated}) AND ${CLAIM_VISIBLE("c")}`;
    const total = this.one<{ n: number }>(p, `SELECT COUNT(*) AS n ${from}`, [q])?.n ?? 0;
    const hits = this.all<{ id: string; subject: string }>(
      p, `SELECT c.id, c.subject ${from} ORDER BY c.revealed_in, c.id LIMIT ?3`, [q, lim],
    );
    // Snippets are built only for rows that already passed the visibility filter above.
    const snippetOf = (id: string): { snippet: string; lang: Lang } => {
      if (lang !== BASE_LANG) {
        const t = this.db.get<{ s: string }>(
          `SELECT snippet(translation_fts, 2, '[', ']', '…', 12) AS s FROM translation_fts
           WHERE translation_fts MATCH ?1 AND claim_id = ?2 AND lang = '${lang}'`, [q, id],
        );
        if (t) return { snippet: t.s, lang };
      }
      const e = this.db.get<{ s: string }>(
        "SELECT snippet(claim_fts, 1, '[', ']', '…', 12) AS s FROM claim_fts WHERE claim_fts MATCH ?1 AND claim_id = ?2", [q, id],
      );
      return { snippet: e?.s ?? "", lang: BASE_LANG };
    };
    return {
      total,
      hits: hits.map((h) => ({ claimId: h.id as ClaimId, subject: h.subject as EntityId, ...snippetOf(h.id) })),
    };
  }

  /** All episodes in order; unwatched ones expose only season, number, title, synopsis. */
  listEpisodes(p: Progress): EpisodeView[] {
    const rows = this.all<EpRow>(p, `${epSelect(this.language)} ORDER BY ep_index`);
    return rows.map((r) => toEpisode(r, this.language));
  }

  /** One episode by its public season/number. NotFoundError if it does not exist. */
  getEpisode(p: Progress, ref: { season: number; number: number }): EpisodeView {
    const row = this.one<EpRow>(p, `${epSelect(this.language)} WHERE season = ?2 AND number = ?3`, [ref.season, ref.number]);
    return row ? toEpisode(row, this.language) : notFound();
  }

  /** Relation graph from visible claims that have an object. */
  getGraph(p: Progress): GraphView {
    const rows = this.all<ClaimRow>(
      p,
      `SELECT ${claimCols(this.language)} FROM claim c WHERE c.object_id IS NOT NULL AND ${CLAIM_VISIBLE("c")} ORDER BY c.id`,
    );
    const edges = rows.map((r) => {
      const c = toClaim(r, this.language);
      return { claimId: c.id, from: c.subject, to: c.object as EntityId, predicate: c.predicate, state: c.state };
    });
    const degree = new Map<string, number>();
    for (const e of edges) {
      degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
      degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    }
    const kinds = new Map(this.listEntities(p).map((e) => [e.id as string, e.kind]));
    const nodes = [...degree].sort(([a], [b]) => (a < b ? -1 : 1)).map(([id, d]) => ({
      id: id as EntityId, kind: kinds.get(id) as EntityKind, degree: d,
    }));
    return { nodes, edges };
  }

  /** Map pins from visible, non-discarded `coordinates` claims ("lat,lon"). */
  getMap(p: Progress): MapView {
    const claims = this.listClaims(p, { predicate: COORDINATES });
    const kinds = new Map(this.listEntities(p).map((e) => [e.id as string, e.kind]));
    const pins: MapView["pins"] = [];
    const filterKinds = new Set<EntityKind>();
    for (const c of claims) {
      if (c.state === "discarded" || c.value === null) continue;
      const [lat, lon] = c.value.split(",").map((s) => Number(s.trim()));
      if (lat === undefined || lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      pins.push({ entityId: c.subject, claimId: c.id, lat, lon });
      const k = kinds.get(c.subject);
      if (k) filterKinds.add(k);
    }
    return { pins, filters: { kinds: [...filterKinds].sort() } };
  }

  /** Case file: visible `role_in_case` claims and other visible claims about a visible case. */
  getCaseFile(p: Progress, caseId: EntityId): CaseFileView {
    const e = this.getEntity(p, caseId);
    if (e.kind !== "case") return notFound();
    const roles = this.listClaims(p, { predicate: ROLE_IN_CASE })
      .filter((c) => c.object === caseId && c.value !== null)
      .map((c) => ({
        claimId: c.id, person: c.subject, role: c.value as string, revealedIn: c.revealedIn,
        status: c.status, state: c.state, supersession: c.supersession,
      }));
    const { claims, ...entity } = e;
    return { case: entity, roles, claims };
  }

  /** Arc items gated by their own revealed_in and by the visibility of what they reference. */
  getArc(p: Progress, arcId: EntityId): ArcView {
    const e = this.getEntity(p, arcId);
    if (e.kind !== "arc") return notFound();
    const rows = this.all<{
      narrative_text: string; revealed_in: number; ref_claim_id: string | null; ref_entity_id: string | null;
    }>(
      p,
      `SELECT a.narrative_text, a.revealed_in, a.ref_claim_id, a.ref_entity_id FROM arc_item a
       WHERE a.arc_id = ?2 AND a.revealed_in <= ?1
         AND (a.ref_claim_id IS NULL OR EXISTS (SELECT 1 FROM claim c WHERE c.id = a.ref_claim_id AND ${CLAIM_VISIBLE("c")}))
         AND (a.ref_entity_id IS NULL OR EXISTS (SELECT 1 FROM entity r WHERE r.id = a.ref_entity_id AND ${ENTITY_VISIBLE("r")}))
       ORDER BY a.ord`,
      [arcId],
    );
    const { claims: _claims, ...arc } = e;
    return {
      arc,
      items: rows.map((r, i) => ({
        position: i + 1, narrative: r.narrative_text, revealedIn: r.revealed_in,
        refClaim: r.ref_claim_id as ClaimId | null, refEntity: r.ref_entity_id as EntityId | null,
      })),
    };
  }

  /** Non-canon fan theories with spoils_up_to <= p, optionally filtered by tag. */
  listTheories(p: Progress, tag?: string): TheoryView[] {
    const rows = this.all<TheoryRow>(
      p, `${theorySelect(this.language)} WHERE t.spoils_up_to <= ?1 ORDER BY t.id`,
    );
    return rows.map((r) => toTheory(r, this.language)).filter((t) => tag === undefined || t.tags.includes(tag));
  }

  /** One visible theory. NotFoundError if hidden or nonexistent. */
  getTheory(p: Progress, id: TheoryId): TheoryView {
    const row = this.one<TheoryRow>(p, `${theorySelect(this.language)} WHERE t.id = ?2 AND t.spoils_up_to <= ?1`, [id]);
    return row ? toTheory(row, this.language) : notFound();
  }
}

/**
 * A sibling engine on the same database that returns texts in `lang` (fallback English).
 * The engine itself is returned when it already has that language.
 */
export function inLanguage(engine: KnowledgeEngine, lang: Lang): KnowledgeEngine {
  const l = normalizeLang(lang);
  return engine.lang === l ? engine : new KnowledgeEngine(engine["db"], l);
}

// ---------- row mappers declared after the class are hoisted-safe consts below ----------

interface EpRow {
  ep_index: number; season: number; number: number; title: string; synopsis: string; watched: number;
  details: string | null; title_tr: number; synopsis_tr: number;
}
const EP_ID = "CAST(episode.ep_index AS TEXT)";
const epSelect = (lang: Lang) => `SELECT ep_index, season, number,
    COALESCE(${trText(lang, EP_ID, "title")}, title) AS title,
    COALESCE(${trText(lang, EP_ID, "synopsis")}, synopsis) AS synopsis,
  (${trText(lang, EP_ID, "title")}) IS NOT NULL AS title_tr,
  (${trText(lang, EP_ID, "synopsis")}) IS NOT NULL AS synopsis_tr,
  (ep_index <= ?1) AS watched,
  CASE WHEN ep_index <= ?1 THEN details END AS details FROM episode`;

function toEpisode(r: EpRow, lang: Lang): EpisodeView {
  const langs = { titleLang: r.title_tr ? lang : BASE_LANG, synopsisLang: r.synopsis_tr ? lang : BASE_LANG };
  if (r.watched) {
    return {
      watched: true, epIndex: r.ep_index, season: r.season, number: r.number,
      title: r.title, synopsis: r.synopsis, details: r.details ?? "", ...langs,
    };
  }
  return { watched: false, season: r.season, number: r.number, title: r.title, synopsis: r.synopsis, ...langs };
}

interface TheoryRow {
  id: string; title: string; body: string; source_url: string; author_handle: string | null;
  spoils_up_to: number; tags: string; title_tr: number; body_tr: number;
}
const theorySelect = (lang: Lang) => `SELECT t.id, t.source_url, t.author_handle, t.spoils_up_to, t.tags,
    COALESCE(${trText(lang, "t.id", "title")}, t.title) AS title, COALESCE(${trText(lang, "t.id", "body")}, t.body) AS body,
  (${trText(lang, "t.id", "title")}) IS NOT NULL AS title_tr, (${trText(lang, "t.id", "body")}) IS NOT NULL AS body_tr
  FROM theory t`;
function toTheory(r: TheoryRow, lang: Lang): TheoryView {
  return {
    id: r.id as TheoryId, title: r.title, body: r.body, sourceUrl: r.source_url,
    authorHandle: r.author_handle, spoilsUpTo: r.spoils_up_to, tags: JSON.parse(r.tags) as string[],
    titleLang: r.title_tr ? lang : BASE_LANG, bodyLang: r.body_tr ? lang : BASE_LANG,
    canon: false,
  };
}
