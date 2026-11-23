import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
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
});
