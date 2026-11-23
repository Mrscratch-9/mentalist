import { KnowledgeEngine, type SqlDriver } from "@mentalist/core";
import { openWasmDriver } from "./wasmDriver";

export interface Canon {
  db: SqlDriver;
  engine: KnowledgeEngine;
}

/** Fetch the compiled canon database and open it. Errors never carry data. */
export async function openCanon(url = "/canon.sqlite"): Promise<Canon> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not load the series database.");
  const db = await openWasmDriver(new Uint8Array(await res.arrayBuffer()));
  return { db, engine: new KnowledgeEngine(db) };
}

export async function loadCanon(): Promise<KnowledgeEngine> {
  return (await openCanon()).engine;
}
