import type { SqlDriver } from "./driver.ts";
import { SCHEMA_STATEMENTS } from "./schema.ts";
import type { Dataset } from "./types.ts";

/** Create the schema in an empty database and insert a dataset (incl. the per-claim FTS index). */
export function loadDataset(db: SqlDriver, data: Dataset): void {
  for (const stmt of SCHEMA_STATEMENTS) db.exec(stmt);
  for (const e of data.episodes) {
    db.exec("INSERT INTO episode VALUES (?1,?2,?3,?4,?5,?6)", [
      e.epIndex, e.season, e.number, e.title, e.synopsis, e.details,
    ]);
  }
  for (const e of data.entities) {
    db.exec("INSERT INTO entity VALUES (?1,?2,?3)", [e.id, e.kind, e.introducedIn]);
  }
  for (const c of data.claims) {
    db.exec("INSERT INTO claim VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)", [
      c.id, c.subject, c.predicate, c.object, c.value, c.revealedIn,
      c.supersededIn, c.supersededBy, c.status, c.sourceId, c.note,
    ]);
    db.exec("INSERT INTO claim_fts (claim_id, body) VALUES (?1, ?2)", [
      c.id, `${c.value ?? ""} ${c.note}`,
    ]);
  }
  for (const a of data.arcItems) {
    db.exec("INSERT INTO arc_item VALUES (?1,?2,?3,?4,?5,?6)", [
      a.arc, a.order, a.refClaim, a.refEntity, a.narrativeText, a.revealedIn,
    ]);
  }
  const translations = data.translations ?? [];
  for (const t of translations) {
    db.exec("INSERT INTO translation VALUES (?1,?2,?3,?4)", [t.targetId, t.field, t.lang, t.text]);
  }
  // Per (claim, language) search body: translated value/note, English where a field has no translation.
  const trOf = new Map(translations.map((t) => [`${t.targetId}\u0000${t.field}\u0000${t.lang}`, t.text]));
  const langs = [...new Set(translations.map((t) => t.lang))].sort();
  for (const c of data.claims) {
    for (const lang of langs) {
      const v = trOf.get(`${c.id}\u0000value\u0000${lang}`);
      const n = trOf.get(`${c.id}\u0000note\u0000${lang}`);
      if (v === undefined && n === undefined) continue;
      db.exec("INSERT INTO translation_fts (claim_id, lang, body) VALUES (?1, ?2, ?3)", [
        c.id, lang, `${v ?? c.value ?? ""} ${n ?? c.note}`,
      ]);
    }
  }
  for (const t of data.theories) {
    db.exec("INSERT INTO theory VALUES (?1,?2,?3,?4,?5,?6,?7)", [
      t.id, t.title, t.body, t.sourceUrl, t.authorHandle, t.spoilsUpTo, JSON.stringify(t.tags),
    ]);
  }
}
