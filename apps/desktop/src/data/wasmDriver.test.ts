import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openCanon } from "./canon";
import { openWasmDriver } from "./wasmDriver";

afterEach(() => vi.unstubAllGlobals());

/** Synthetic database bytes, exported from an in-memory sqlite-wasm database. */
async function syntheticBytes(): Promise<Uint8Array> {
  const sqlite3 = await sqlite3InitModule();
  const db = new sqlite3.oo1.DB();
  db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)");
  db.exec("INSERT INTO t VALUES (1,'alpha'),(2,'beta')");
  const bytes = sqlite3.capi.sqlite3_js_db_export(db.pointer!);
  db.close();
  return bytes;
}

describe("openWasmDriver", () => {
  it("binds parameters and returns object rows", async () => {
    const db = await openWasmDriver(await syntheticBytes());
    expect(db.all("SELECT id, name FROM t WHERE id >= ?1 ORDER BY id", [2])).toEqual([{ id: 2, name: "beta" }]);
    db.close();
  });

  it("works with no params and with an empty params array", async () => {
    const db = await openWasmDriver(await syntheticBytes());
    expect(db.all("SELECT id FROM t ORDER BY id")).toEqual([{ id: 1 }, { id: 2 }]);
    expect(db.all("SELECT id FROM t ORDER BY id", [])).toEqual([{ id: 1 }, { id: 2 }]);
    db.close();
  });

  it("get returns the first row, or undefined for no rows", async () => {
    const db = await openWasmDriver(await syntheticBytes());
    expect(db.get("SELECT name FROM t ORDER BY id")).toEqual({ name: "alpha" });
    expect(db.get("SELECT name FROM t WHERE id = ?1", [99])).toBeUndefined();
    db.close();
  });

  it("is read-only", async () => {
    const db = await openWasmDriver(await syntheticBytes());
    expect(() => db.exec("INSERT INTO t VALUES (3,'x')")).toThrow();
    db.close();
  });

  it("fails to open non-database bytes with a generic message", async () => {
    const junk = new TextEncoder().encode("this is not a database, ".repeat(50));
    await expect(openWasmDriver(junk)).rejects.toThrow(/series database/);
  });

  it("close is idempotent-safe: queries after close throw", async () => {
    const db = await openWasmDriver(await syntheticBytes());
    db.close();
    expect(() => db.all("SELECT 1")).toThrow();
  });
});

describe("openCanon", () => {
  const stub = (res: Partial<Response> & { arrayBuffer?: () => Promise<ArrayBuffer> }) =>
    vi.stubGlobal("fetch", vi.fn(async () => res));

  it("rejects a non-ok response with a generic message", async () => {
    stub({ ok: false, status: 404 });
    await expect(openCanon("/x")).rejects.toThrow("Could not load the series database.");
  });

  it("rejects an HTML 200 fallback before deserializing", async () => {
    const html = new TextEncoder().encode("<!doctype html><html></html>");
    stub({ ok: true, arrayBuffer: async () => html.buffer as ArrayBuffer });
    await expect(openCanon("/x")).rejects.toThrow("Could not load the series database.");
  });

  it("opens valid bytes and exposes close", async () => {
    const b = await syntheticBytes();
    stub({ ok: true, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer });
    const canon = await openCanon("/x");
    expect(canon.db.get("SELECT COUNT(*) AS n FROM t")).toEqual({ n: 2 });
    canon.close();
  });
});
