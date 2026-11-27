import { createHash } from "node:crypto";
import { NON_TEXT_PREDICATES, episodeTargetId, type Translation, type TranslationField } from "@mentalist/core";
import type { PipelineError } from "./errors.ts";
import type { LoadedDoc, LoadedI18n } from "./load.ts";
import { opaque } from "./compile.ts";
import { collect, episodeIndex } from "./validate.ts";

/** First 12 hex chars of the SHA-256 of the exact English text: the stale-detection hash of a translation. */
export const textHash = (englishText: string): string =>
  createHash("sha256").update(englishText).digest("hex").slice(0, 12);

interface Target {
  /** Id of the row in the compiled database (`translation.target_id`). */
  targetId: string;
  /** Current English text of the field ("" when the field does not exist or is empty). */
  english: string;
}

type Lookup =
  | { ok: true; target: Target }
  | { ok: false; rule: "i18n.key_unresolved" | "i18n.field_invalid" | "i18n.key_ambiguous" };

/** Finds the English item a (key, field) pair points at. Assumes `docs` were checked by `validate`'s canon rules. */
function targets(docs: LoadedDoc[]): (key: string, field: TranslationField) => Lookup {
  const eps = episodeIndex(docs);
  const epRec = new Map(collect(docs, "episodes").map((l) => [l.r.code, l.r]));
  const claims = new Map<string, ReturnType<typeof collect<"claims">>[number]["r"]>();
  for (const l of collect(docs, "claims")) if (!claims.has(l.r.key)) claims.set(l.r.key, l.r);
  const theories = new Map<string, ReturnType<typeof collect<"theories">>[number]["r"]>();
  for (const l of collect(docs, "theories")) if (!theories.has(l.r.key)) theories.set(l.r.key, l.r);

  return (key, field) => {
    const ep = epRec.get(key);
    const claim = claims.get(key);
    const theory = theories.get(key);
    if (!ep && !claim && !theory) return { ok: false, rule: "i18n.key_unresolved" };
    const found: Target[] = [];
    if (ep && (field === "title" || field === "synopsis")) {
      found.push({ targetId: episodeTargetId(eps.get(key)!), english: ep[field] });
    }
    if (claim && (field === "value" || field === "note")) {
      const prose = !NON_TEXT_PREDICATES.includes(claim.predicate);
      const english = field === "value" ? (claim.value ?? "") : claim.note;
      if (field === "note" || prose) found.push({ targetId: opaque("c", key), english });
    }
    if (theory && (field === "title" || field === "body")) {
      found.push({ targetId: opaque("t", key), english: theory[field] });
    }
    if (found.length > 1) return { ok: false, rule: "i18n.key_ambiguous" };
    const t = found[0];
    if (!t || t.english === "") return { ok: false, rule: "i18n.field_invalid" };
    return { ok: true, target: t };
  };
}

/** Rules for translation files: the key exists, the field exists on it, no duplicate (lang, key, field). */
export function validateI18n(docs: LoadedDoc[], i18n: LoadedI18n[]): PipelineError[] {
  const errs: PipelineError[] = [];
  const find = targets(docs);
  const seen = new Set<string>();
  for (const f of i18n) {
    f.doc.translations.forEach((t, i) => {
      const at = { file: f.file, path: `translations[${i}]` };
      const id = `${f.lang}\u0000${t.key}\u0000${t.field}`;
      if (seen.has(id)) { errs.push({ ...at, rule: "i18n.duplicate", detail: `${f.lang} ${t.key} ${t.field}` }); return; }
      seen.add(id);
      const r = find(t.key, t.field);
      if (!r.ok) errs.push({ ...at, path: `${at.path}.${r.rule === "i18n.field_invalid" ? "field" : "key"}`, rule: r.rule, detail: r.rule === "i18n.field_invalid" ? `${t.key} ${t.field}` : t.key });
    });
  }
  return errs;
}

export interface I18nResult {
  translations: Translation[];
  /** Entries whose hash no longer matches the current English text: not compiled. `detail` = "<lang> <key> <field>". */
  stale: PipelineError[];
}

/** Compile validated translation files: current ones become rows, stale ones are reported (keys only). */
export function resolveI18n(docs: LoadedDoc[], i18n: LoadedI18n[]): I18nResult {
  const find = targets(docs);
  const translations: Translation[] = [];
  const stale: PipelineError[] = [];
  for (const f of i18n) {
    f.doc.translations.forEach((t, i) => {
      const r = find(t.key, t.field);
      if (!r.ok) return; // only reachable when validate() was skipped
      if (textHash(r.target.english) !== t.hash) {
        stale.push({ file: f.file, path: `translations[${i}]`, rule: "i18n.stale", detail: `${f.lang} ${t.key} ${t.field}` });
        return;
      }
      translations.push({ targetId: r.target.targetId, field: t.field, lang: f.lang, text: t.text });
    });
  }
  return { translations, stale };
}
