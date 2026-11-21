import { DatabaseSync } from "node:sqlite";
import {
  claimId, entityId, loadDataset,
  type Claim, type ClaimStatus, type Dataset, type Entity, type EntityKind, type SqlDriver, type SqlValue,
} from "../src/index.ts";

/** node:sqlite-backed driver (the app uses SQLite WASM behind the same interface). */
export function nodeDriver(): SqlDriver & { raw: DatabaseSync } {
  const raw = new DatabaseSync(":memory:");
  const bind = (p?: SqlValue[]) => p ?? [];
  return {
    raw,
    all: <T>(sql: string, p?: SqlValue[]) => raw.prepare(sql).all(...bind(p)) as T[],
    get: <T>(sql: string, p?: SqlValue[]) => raw.prepare(sql).get(...bind(p)) as T | undefined,
    exec: (sql, p) => {
      if (p && p.length) raw.prepare(sql).run(...p);
      else raw.exec(sql);
    },
  };
}

export function dbWith(data: Dataset): SqlDriver & { raw: DatabaseSync } {
  const db = nodeDriver();
  loadDataset(db, data);
  return db;
}

export const ent = (id: string, kind: EntityKind, introducedIn: number): Entity => ({
  id: entityId(id), kind, introducedIn,
});

export function clm(
  id: string, subject: string, predicate: string, revealedIn: number,
  o: Partial<{
    object: string; value: string; status: ClaimStatus; supIn: number; supBy: string; note: string;
  }> = {},
): Claim {
  return {
    id: claimId(id), subject: entityId(subject), predicate,
    object: o.object ? entityId(o.object) : null,
    value: o.value ?? null, revealedIn,
    supersededIn: o.supIn ?? null, supersededBy: o.supBy ? claimId(o.supBy) : null,
    status: o.status ?? "confirmed", sourceId: `src-${id}`, note: o.note ?? "",
  };
}

export const emptyData = (): Dataset => ({
  episodes: [], entities: [], claims: [], arcItems: [], theories: [],
});
