import { CASE_ROLES, COORDINATES, ROLE_IN_CASE } from "@mentalist/core";
import type { PipelineError } from "./errors.ts";
import { validateI18n } from "./i18n.ts";
import type { LoadedDoc, LoadedI18n } from "./load.ts";
import type { Doc } from "./schema.ts";

export const CODE_RE = /^S(\d+)E(\d+)$/;

export interface Loc<T> { file: string; path: string; r: T }
type Item<K extends keyof Doc> = Doc[K][number];

/** All records of one collection across files, with their file and position. */
export const collect = <K extends keyof Doc>(docs: LoadedDoc[], k: K): Loc<Item<K>>[] =>
  docs.flatMap((d) => d.doc[k].map((r, i) => ({ file: d.file, path: `${k}[${i}]`, r: r as Item<K> })));

/** Episode code → global index (1..N, in merged order); first occurrence wins. */
export function episodeIndex(docs: LoadedDoc[]): Map<string, number> {
  const m = new Map<string, number>();
  collect(docs, "episodes").forEach((l, i) => { if (!m.has(l.r.code)) m.set(l.r.code, i + 1); });
  return m;
}

/** Consistency rules (design §5), plus the translation rules when `i18n` files are given. Returns every error found. */
export function validate(docs: LoadedDoc[], i18n: LoadedI18n[] = []): PipelineError[] {
  const errs: PipelineError[] = [];
  const bad = (l: { file: string; path: string }, field: string, rule: string, detail?: string) =>
    errs.push({ file: l.file, path: field ? `${l.path}.${field}` : l.path, rule, ...(detail ? { detail } : {}) });

  const eps = episodeIndex(docs);
  const seenCodes = new Set<string>();
  for (const l of collect(docs, "episodes")) {
    const code = l.r.code;
    if (!CODE_RE.test(code)) bad(l, "code", "episode.code_malformed", code);
    else if (seenCodes.has(code)) bad(l, "code", "episode.code_duplicate", code);
    seenCodes.add(code);
  }
  const ep = (l: { file: string; path: string }, field: string, code: string): number | undefined => {
    const v = eps.get(code);
    if (v === undefined) bad(l, field, "ref.unresolved", code);
    return v;
  };
  /** Index a collection by author key, reporting duplicates (first wins). */
  const index = <T extends { key: string }>(list: Loc<T>[]) => {
    const m = new Map<string, Loc<T>>();
    for (const l of list) {
      if (m.has(l.r.key)) bad(l, "", "key.duplicate", l.r.key);
      else m.set(l.r.key, l);
    }
    return m;
  };

  const sources = index(collect(docs, "sources"));
  for (const [k, l] of sources) {
    if (l.r.kind !== "episode") continue;
    if (!l.r.episode) bad(l, "episode", "source.episode_required", k);
    else ep(l, "episode", l.r.episode);
  }

  const entities = index(collect(docs, "entities"));
  const intro = new Map<string, number>();
  for (const [k, l] of entities) {
    const v = ep(l, "introduced", l.r.introduced);
    if (v !== undefined) intro.set(k, v);
  }

  const claims = index(collect(docs, "claims"));
  const rev = new Map<string, number>();
  for (const [k, l] of claims) {
    const c = l.r;
    const r = ep(l, "revealed", c.revealed);
    if (r !== undefined) rev.set(k, r);
    for (const f of ["subject", "object"] as const) {
      const ref = c[f];
      if (ref === undefined) continue;
      if (!entities.has(ref)) { bad(l, f, "ref.unresolved", ref); continue; }
      const i = intro.get(ref);
      if (r !== undefined && i !== undefined && r < i) bad(l, "revealed", `claim.revealed_before_${f}`, k);
    }
    if (!c.source) bad(l, "source", "claim.source_missing", k);
    else if (!sources.has(c.source)) bad(l, "source", "ref.unresolved", c.source);
    if (c.superseded) {
      const s = ep(l, "superseded.in", c.superseded.in);
      if (s !== undefined && r !== undefined && s <= r) bad(l, "superseded.in", "claim.superseded_not_after_reveal", k);
      if (!claims.has(c.superseded.by)) bad(l, "superseded.by", "ref.unresolved", c.superseded.by);
    }
    // object / value shape: exactly one, except role_in_case which carries both (case + role)
    const isRole = c.predicate === ROLE_IN_CASE;
    const hasO = c.object !== undefined;
    const hasV = c.value !== undefined;
    if (isRole ? !(hasO && hasV) : hasO === hasV) bad(l, "", "claim.object_value", k);
    if (isRole) {
      if (hasV && !(CASE_ROLES as readonly string[]).includes(c.value!)) bad(l, "value", "claim.role_invalid", k);
      const o = hasO ? entities.get(c.object!) : undefined;
      if (o && o.r.kind !== "case") bad(l, "object", "claim.role_object_not_case", k);
    }
    if (c.predicate === COORDINATES && hasV) {
      const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(c.value!);
      if (!m || Math.abs(Number(m[1])) > 90 || Math.abs(Number(m[2])) > 180) bad(l, "value", "claim.coordinates_invalid", k);
    }
  }
  // cycles in superseded chains: report each claim that lies on a cycle
  for (const [k, l] of claims) {
    let next = l.r.superseded?.by;
    for (let n = 0; next !== undefined && n <= claims.size; n++) {
      if (next === k) { bad(l, "superseded.by", "claim.supersede_cycle", k); break; }
      next = claims.get(next)?.r.superseded?.by;
    }
  }

  const seenArcs = new Set<string>();
  for (const a of collect(docs, "arcs")) {
    if (seenArcs.has(a.r.arc)) bad(a, "arc", "arc.duplicate", a.r.arc);
    seenArcs.add(a.r.arc);
    const orders = new Set<number>();
    const arc = entities.get(a.r.arc);
    if (!arc) bad(a, "arc", "ref.unresolved", a.r.arc);
    else if (arc.r.kind !== "arc") bad(a, "arc", "arc.not_arc_entity", a.r.arc);
    a.r.items.forEach((it, j) => {
      const l = { file: a.file, path: `${a.path}.items[${j}]` };
      if (orders.has(it.order)) bad(l, "order", "arc.order_duplicate", String(it.order));
      orders.add(it.order);
      const r = ep(l, "revealed", it.revealed);
      const field = it.claim !== undefined ? "claim" : "entity";
      const ref = (it.claim ?? it.entity)!;
      if (!(field === "claim" ? claims : entities).has(ref)) { bad(l, field, "ref.unresolved", ref); return; }
      const floor = field === "claim" ? rev.get(ref) : intro.get(ref);
      if (r !== undefined && floor !== undefined && r < floor) bad(l, "revealed", "arc.item_before_ref", ref);
    });
  }

  for (const [, l] of index(collect(docs, "theories"))) {
    if (l.r.spoils_up_to !== undefined) ep(l, "spoils_up_to", l.r.spoils_up_to);
  }
  errs.push(...validateI18n(docs, i18n));
  return errs;
}
