import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { KnowledgeEngine, progress } from "@mentalist/core";
import { compile } from "../src/compile.ts";
import { buildDatabase } from "../src/index.ts";
import { nodeDriver } from "../src/driver.ts";
import { base, loaded, tempDir, writeCanon } from "./fixture.ts";

describe("compile", () => {
  it("derives ep_index and season/number out of the episode list order", () => {
    const d = compile(loaded(base()));
    expect(d.episodes.map((e) => [e.epIndex, e.season, e.number, e.title])).toEqual([
      [1, 1, 1, "One"], [2, 1, 2, "Two"], [3, 2, 1, "Three"],
    ]);
    expect(d.claims[1]!.revealedIn).toBe(2);
    expect(d.theories[0]!.spoilsUpTo).toBe(2);
  });

  it("emits opaque, stable ids with no author key text (S3)", () => {
    const a = compile(loaded(base()));
    expect(a).toEqual(compile(loaded(base())));
    const ids = [
      ...a.entities.map((e) => e.id), ...a.claims.map((c) => c.id),
      ...a.claims.map((c) => c.sourceId), ...a.theories.map((t) => t.id),
    ];
    for (const id of ids) {
      expect(id).toMatch(/^[ecst]_[0-9a-f]{12}$/);
      for (const k of ["alice", "bob", "case1", "c_name", "src1", "t1"]) expect(id).not.toContain(k);
    }
    expect(new Set(a.entities.map((e) => e.id)).size).toBe(a.entities.length);
    expect(new Set(a.claims.map((c) => c.id)).size).toBe(a.claims.length);
    expect(a.claims[0]!.sourceId).toBe(a.claims[1]!.sourceId);
    expect(a.claims[0]!.sourceId).not.toBe(a.claims[0]!.id);
    expect(a.arcItems[0]!.refClaim).toBe(a.claims[1]!.id);
  });

  it("different keys give different ids", () => {
    const r = base();
    r.entities[0]!["key"] = "alicia";
    r.claims.forEach((c) => { if (c.subject === "alice") c.subject = "alicia"; });
    expect(compile(loaded(r)).entities[0]!.id).not.toBe(compile(loaded(base())).entities[0]!.id);
  });
});

describe("end to end", () => {
  it("compiles YAML to SQLite readable through KnowledgeEngine", () => {
    const dir = tempDir();
    const out = join(dir, "out.sqlite");
    const raw = base();
    raw.claims.push({ key: "c_alias", subject: "alice", predicate: "alias", value: "Ally", revealed: "S1E2", source: "src1" } as never);
    writeCanon(dir, raw);
    expect(buildDatabase(dir, out, { force: false }).errors).toEqual([]);
    const db = new DatabaseSync(out, { readOnly: true });
    const engine = new KnowledgeEngine(nodeDriver(db));
    expect(engine.listClaims(progress(1), { predicate: "alias" })).toHaveLength(0);
    expect(engine.listClaims(progress(2), { predicate: "alias" })).toHaveLength(1);
    db.close();
  });
});
