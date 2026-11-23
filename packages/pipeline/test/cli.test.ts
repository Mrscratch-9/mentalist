import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildDatabase, writeDatabase, compile, loadDir } from "../src/index.ts";
import { base, tempDir, writeCanon, type Raw } from "./fixture.ts";

const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const run = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });

function setup(mut?: (r: Raw) => void) {
  const root = tempDir();
  const inDir = join(root, "in");
  mkdirSync(inDir);
  const r = base() as unknown as Raw;
  mut?.(r);
  writeCanon(inDir, r);
  return { root, inDir, out: join(root, "out.sqlite") };
}

describe("cli", () => {
  it("builds, prints a one-line summary, exits 0, leaves no temp file", () => {
    const { root, inDir, out } = setup();
    const r = run(inDir, out);
    expect(r.status).toBe(0);
    expect(r.stdout.trim().split("\n")).toHaveLength(1);
    expect(r.stdout).toContain("3 episodes");
    expect(r.stdout).toContain("3 claims");
    expect(readdirSync(root).sort()).toEqual(["in", "out.sqlite"]);
  });

  it("exits 1 on validation failure with spoiler-safe stderr and writes nothing", () => {
    const { inDir, out } = setup((r) => { r["claims"]![0].value = "zqxmark_text"; r["claims"]![0].revealed = "S9E9"; });
    const r = run(inDir, out);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("canon.yaml: claims[0].revealed: ref.unresolved");
    expect(r.stderr).not.toContain("zqxmark");
    expect(existsSync(out)).toBe(false);
  });

  it("--verbose adds record keys to errors", () => {
    const { inDir, out } = setup((r) => { r["claims"]![0].subject = "zqxmark_key"; });
    const r = run(inDir, out, "--verbose");
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("zqxmark_key");
  });

  it("rejects unknown fields (strict schema)", () => {
    const { inDir, out } = setup((r) => { r["claims"]![0].extra = 1; });
    const r = run(inDir, out);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("claims[0]: schema");
    expect(existsSync(out)).toBe(false);
  });

  it("refuses to overwrite without --force and leaves the file untouched", () => {
    const { inDir, out } = setup();
    writeFileSync(out, "precious");
    const r = run(inDir, out);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("--force");
    expect(readFileSync(out, "utf8")).toBe("precious");
  });

  it("output-exists error is one line without the Usage line", () => {
    const { inDir, out } = setup();
    writeFileSync(out, "precious");
    const r = run(inDir, out);
    expect(r.status).toBe(2);
    expect(r.stderr).toBe(`${out} already exists (use --force to overwrite)\n`);
  });

  it("an unreadable input file exits 2 with a one-line spoiler-safe message", () => {
    const { root, inDir } = setup();
    mkdirSync(join(inDir, "x.yaml"));
    const out = join(root, "o3.sqlite");
    const r = run(inDir, out);
    expect(r.status).toBe(2);
    expect(r.stderr).toBe("input file not readable: x.yaml\n");
    expect(existsSync(out)).toBe(false);
  });

  it("rejects an empty source (exit 1) without leaking record text and writes nothing", () => {
    const { inDir, out } = setup((r) => { r["claims"]![0].source = ""; r["claims"]![0].value = "zqxmark_text"; });
    const r = run(inDir, out);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("canon.yaml: claims[0].source: schema");
    expect(r.stderr).not.toContain("zqxmark");
    expect(existsSync(out)).toBe(false);
  });

  it("produces deterministic ids across two builds", () => {
    const { root, inDir } = setup();
    const a = buildDatabase(inDir, join(root, "a.sqlite"), { force: false });
    const b = buildDatabase(inDir, join(root, "b.sqlite"), { force: false });
    expect(a.errors).toEqual([]);
    expect(a.dataset).toEqual(b.dataset);
    expect(a.dataset!.claims[0]!.id).toMatch(/[0-9a-f]{12}$/);
  });

  it("overwrites with --force", () => {
    const { inDir, out } = setup();
    writeFileSync(out, "old");
    expect(run(inDir, out, "--force").status).toBe(0);
    expect(readFileSync(out).subarray(0, 6).toString()).toBe("SQLite");
  });

  it("exits 2 on usage errors", () => {
    expect(run().status).toBe(2);
    expect(run("only-one").status).toBe(2);
    const { inDir, out } = setup();
    const bad = run(inDir, out, "--nope");
    expect(bad.status).toBe(2);
    expect(bad.stderr).toContain("Usage");
    const empty = tempDir();
    expect(run(empty, join(empty, "o.sqlite")).status).toBe(2);
    expect(run(join(empty, "missing"), join(empty, "o.sqlite")).status).toBe(2);
  });

  it("exits 2 with a one-line message (no stack) when the output directory is missing", () => {
    const { root, inDir } = setup();
    const r = run(inDir, join(root, "nodir", "out.sqlite"));
    expect(r.status).toBe(2);
    expect(r.stderr.trim().split("\n")).toHaveLength(1);
    expect(r.stderr).not.toMatch(/\bat |node:internal/);
    expect(r.stdout).toBe("");
  });

  it("reports malformed YAML as yaml.parse (exit 1, spoiler-safe)", () => {
    const { root, inDir } = setup();
    writeFileSync(join(inDir, "broken.yaml"), "episodes: [zqxmark_text\n  - : :\n");
    const out = join(root, "o2.sqlite");
    const r = run(inDir, out);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("broken.yaml: $: yaml.parse");
    expect(r.stderr).not.toContain("zqxmark");
    expect(existsSync(out)).toBe(false);
  });

  it("merges multiple files in sorted name order and accepts .yml", () => {
    const root = tempDir();
    const inDir = join(root, "in");
    mkdirSync(inDir);
    const b = base() as unknown as Raw;
    const first = { episodes: [b["episodes"]![0], b["episodes"]![1]] };
    const second = { episodes: [b["episodes"]![2]], sources: b["sources"], entities: b["entities"], claims: b["claims"], arcs: b["arcs"], theories: b["theories"] };
    writeCanon(inDir, second, "b.yml");
    writeCanon(inDir, first, "a.yaml");
    const out = join(root, "out.sqlite");
    const res = buildDatabase(inDir, out, { force: false });
    expect(res.errors).toEqual([]);
    expect(res.dataset!.episodes.map((e) => e.title)).toEqual(["One", "Two", "Three"]);
    expect(loadDir(inDir).docs.map((d) => d.file)).toEqual(["a.yaml", "b.yml"]);
  });

  it("a failed validation with --force leaves an existing output untouched", () => {
    const { inDir, out } = setup((r) => { r["claims"]![0].revealed = "S9E9"; });
    writeFileSync(out, "precious");
    const r = run(inDir, out, "--force");
    expect(r.status).toBe(1);
    expect(readFileSync(out, "utf8")).toBe("precious");
    expect(readdirSync(join(out, "..")).sort()).toEqual(["in", "out.sqlite"]);
  });

  it("a failure while writing removes the temp file and leaves the output untouched", () => {
    const { root, inDir, out } = setup();
    const { docs } = loadDir(inDir);
    const data = compile(docs);
    (data.claims[0] as { subject: unknown }).subject = null; // violates NOT NULL inside loadDataset
    writeFileSync(out, "precious");
    expect(() => writeDatabase(data, out, true)).toThrow();
    expect(readFileSync(out, "utf8")).toBe("precious");
    expect(readdirSync(root).sort()).toEqual(["in", "out.sqlite"]);
  });
});
