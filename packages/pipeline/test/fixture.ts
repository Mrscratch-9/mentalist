import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { afterAll } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stringify } from "yaml";
import { Doc } from "../src/schema.ts";
import type { LoadedDoc } from "../src/load.ts";

/** Minimal valid synthetic canon (invented names). Mutate a clone per test. */
export const base = () => ({
  episodes: [
    { code: "S1E1", title: "One", synopsis: "s1", details: "d1" },
    { code: "S1E2", title: "Two", synopsis: "s2", details: "d2" },
    { code: "S2E1", title: "Three", synopsis: "s3", details: "d3" },
  ],
  sources: [
    { key: "src1", kind: "episode", episode: "S1E1", scene: "opening" },
    { key: "wiki1", kind: "wiki", url: "https://example.test/x" },
  ],
  entities: [
    { key: "alice", kind: "person", introduced: "S1E1" },
    { key: "bob", kind: "person", introduced: "S1E2" },
    { key: "case1", kind: "case", introduced: "S1E1" },
    { key: "arc1", kind: "arc", introduced: "S1E1" },
  ],
  claims: [
    { key: "c_name", subject: "alice", predicate: "name", value: "Alice Vale", revealed: "S1E1", source: "src1" },
    { key: "c_knows", subject: "alice", predicate: "knows", object: "bob", revealed: "S1E2", source: "src1" },
    { key: "c_role", subject: "alice", predicate: "role_in_case", object: "case1", value: "suspect", revealed: "S1E1", source: "src1" },
  ],
  arcs: [{ arc: "arc1", items: [{ order: 1, claim: "c_knows", text: "They met", revealed: "S1E2" }] }],
  theories: [{ key: "t1", title: "T", body: "B", url: "https://example.test/t", spoils_up_to: "S1E2", tags: ["x"] }],
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Raw = Record<string, any[]>;

export const loaded = (raw: unknown): LoadedDoc[] => [{ file: "t.yaml", doc: Doc.parse(structuredClone(raw)) }];

const created: string[] = [];

/** A fresh temp dir, removed after the test file finishes. */
export function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "pipeline-test-"));
  created.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

export function writeCanon(dir: string, raw: unknown, name = "canon.yaml"): void {
  writeFileSync(join(dir, name), stringify(raw));
}
