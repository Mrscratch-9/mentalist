import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import type { CheckResult } from "./types";

// Loads public/fixture.db into SQLite WASM and runs FTS5 queries against it.
export async function checkSqlite(): Promise<CheckResult> {
  const t0 = performance.now();
  const sqlite3 = await sqlite3InitModule();
  const bytes = new Uint8Array(await (await fetch("/fixture.db")).arrayBuffer());

  const db = new sqlite3.oo1.DB();
  const ptr = sqlite3.wasm.allocFromTypedArray(bytes);
  const { capi } = sqlite3;
  const rc = capi.sqlite3_deserialize(
    db.pointer!, "main", ptr, bytes.byteLength, bytes.byteLength,
    capi.SQLITE_DESERIALIZE_FREEONCLOSE | capi.SQLITE_DESERIALIZE_READONLY,
  );
  if (rc !== 0) throw new Error(`sqlite3_deserialize rc=${rc}`);
  const loadMs = performance.now() - t0;

  const version = db.selectValue("select sqlite_version()");
  const fts5 = db.selectValue("select count(*) from pragma_compile_options where compile_options = 'ENABLE_FTS5'");
  const claims = db.selectValue("select count(*) from claim");

  const q0 = performance.now();
  const hits = db.selectValue(
    "select count(*) from claim_fts join claim c on c.rowid = claim_fts.rowid where claim_fts match 'warehouse AND ledger' and c.revealed_in <= 40",
  );
  const sample = db.selectValue(
    "select snippet(claim_fts, 0, '[', ']', '…', 8) from claim_fts where claim_fts match 'teacup' order by rank limit 1",
  );
  const queryMs = performance.now() - q0;
  db.close();

  const pass = fts5 === 1 && Number(claims) > 0 && Number(hits) > 0;
  return {
    pass,
    detail: `sqlite ${version}, FTS5=${fts5 === 1}, ${claims} claims, load ${loadMs.toFixed(0)} ms, ` +
      `gated FTS hits=${hits}, query ${queryMs.toFixed(1)} ms, snippet "${sample}"`,
  };
}
