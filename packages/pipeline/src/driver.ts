import type { DatabaseSync } from "node:sqlite";
import type { SqlDriver, SqlValue } from "@mentalist/core";

/** node:sqlite-backed SqlDriver (the app uses SQLite WASM behind the same interface). */
export function nodeDriver(raw: DatabaseSync): SqlDriver {
  return {
    all: <T>(sql: string, p: SqlValue[] = []) => raw.prepare(sql).all(...p) as T[],
    get: <T>(sql: string, p: SqlValue[] = []) => raw.prepare(sql).get(...p) as T | undefined,
    exec: (sql, p) => {
      if (p?.length) raw.prepare(sql).run(...p);
      else raw.exec(sql);
    },
  };
}
