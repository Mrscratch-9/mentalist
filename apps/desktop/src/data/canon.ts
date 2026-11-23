import { KnowledgeEngine, type SqlDriver } from "@mentalist/core";
import { openWasmDriver, type WasmDriver } from "./wasmDriver";

export interface Canon {
  db: SqlDriver;
  engine: KnowledgeEngine;
  /** Free the WASM database. The Canon must not be used afterwards. */
  close(): void;
}

const SQLITE_MAGIC = "SQLite format 3\0";

function hasSqliteHeader(bytes: Uint8Array): boolean {
  if (bytes.length < SQLITE_MAGIC.length) return false;
  for (let i = 0; i < SQLITE_MAGIC.length; i++) {
    if (bytes[i] !== SQLITE_MAGIC.charCodeAt(i)) return false;
  }
  return true;
}

/** Fetch the compiled canon database and open it. Errors never carry data. */
export async function openCanon(url = "/canon.sqlite"): Promise<Canon> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not load the series database.");
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!hasSqliteHeader(bytes)) throw new Error("Could not load the series database.");
  const db: WasmDriver = await openWasmDriver(bytes);
  return { db, engine: new KnowledgeEngine(db), close: () => db.close() };
}

