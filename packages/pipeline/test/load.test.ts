import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadDir } from "../src/index.ts";
import { tempDir } from "./fixture.ts";

const put = (dir: string, rel: string, text: string) => {
  mkdirSync(join(dir, rel, ".."), { recursive: true });
  writeFileSync(join(dir, rel), text);
};

describe("loadDir recursion", () => {
  it("reads nested directories, in deterministic relative-path order, with forward-slash names", () => {
    const dir = tempDir();
    put(dir, "b.yaml", "entities: []\n");
    put(dir, "generated/z.yml", "entities: []\n");
    put(dir, "generated/a.yaml", "entities: []\n");
    put(dir, "generated/deep/m.yaml", "entities: []\n");
    put(dir, "a.yaml", "entities: []\n");
    put(dir, "notes.txt", "ignored");
    put(dir, "generated/readme.md", "ignored");
    const { docs, errors } = loadDir(dir);
    expect(errors).toEqual([]);
    expect(docs.map((d) => d.file)).toEqual(["a.yaml", "b.yaml", "generated/a.yaml", "generated/deep/m.yaml", "generated/z.yml"]);
  });

  it("reports errors of nested files with their relative path", () => {
    const dir = tempDir();
    put(dir, "a.yaml", "entities: []\n");
    put(dir, "generated/bad.yaml", "bogus: 1\n");
    const { errors } = loadDir(dir);
    expect(errors.map((e) => `${e.file}: ${e.rule}`)).toEqual(["generated/bad.yaml: schema"]);
  });

  it("still throws a usage error when a directory has no yaml at any depth", () => {
    const dir = tempDir();
    put(dir, "sub/readme.md", "x");
    expect(() => loadDir(dir)).toThrow(/no \.yaml files/);
  });

  it("a flat directory behaves as before (sorted by name)", () => {
    const dir = tempDir();
    put(dir, "b.yaml", "entities: []\n");
    put(dir, "a.yaml", "entities: []\n");
    expect(loadDir(dir).docs.map((d) => d.file)).toEqual(["a.yaml", "b.yaml"]);
  });
});
