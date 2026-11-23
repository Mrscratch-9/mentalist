import type { SqlDriver, SqlValue } from "@mentalist/core";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";

/** Open a read-only in-memory SQLite WASM database from serialized bytes. */
export type WasmDriver = SqlDriver & { close(): void };

export async function openWasmDriver(bytes: Uint8Array): Promise<WasmDriver> {
  const sqlite3 = await sqlite3InitModule();
  const db = new sqlite3.oo1.DB();
  const ptr = sqlite3.wasm.allocFromTypedArray(bytes);
  const { capi } = sqlite3;
  const rc = capi.sqlite3_deserialize(
    db.pointer!, "main", ptr, bytes.byteLength, bytes.byteLength,
    capi.SQLITE_DESERIALIZE_FREEONCLOSE | capi.SQLITE_DESERIALIZE_READONLY,
  );
  // Deserialize is lazy: force a read so a non-database fails here, not later.
  let ok = rc === 0;
  if (ok) {
    try {
      db.exec("SELECT 1 FROM sqlite_master LIMIT 1");
    } catch {
      ok = false;
    }
  }
  if (!ok) {
    db.close();
    throw new Error("Could not open the series database.");
  }

  const all = <T>(sql: string, params?: SqlValue[]): T[] =>
    db.exec({
      sql,
      bind: params && params.length ? params : undefined,
      rowMode: "object",
      returnValue: "resultRows",
    }) as T[];

  return {
    close: () => db.close(),
    all,
    get: <T>(sql: string, params?: SqlValue[]) => all<T>(sql, params)[0],
    exec: (sql, params) => {
      db.exec({ sql, bind: params && params.length ? params : undefined });
    },
  };
}
