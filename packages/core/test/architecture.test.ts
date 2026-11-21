import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as api from "../src/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const coreSrc = resolve(here, "../src");
const repoRoot = resolve(here, "../../..");

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === "target" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

describe("S3 architecture: the UI never touches tables", () => {
  it("index.ts exports no table/schema layer", () => {
    const names = Object.keys(api);
    expect(names.filter((n) => /schema|ddl|table|statement|sql(?!driver)/i.test(n))).toEqual([]);
    const idx = readFileSync(join(coreSrc, "index.ts"), "utf8");
    expect(idx).not.toMatch(/schema/);
    expect(idx).not.toMatch(/export \* from "\.\/engine/);
  });

  it("engine API requires a Progress as its first argument (every public method)", () => {
    const src = readFileSync(join(coreSrc, "engine.ts"), "utf8");
    const body = src.slice(src.indexOf("export class KnowledgeEngine"));
    const publicMethods = [...body.matchAll(/^ {2}(?!private|constructor)(\w+)\(([^)]*)\)/gm)];
    expect(publicMethods.length).toBeGreaterThan(10);
    for (const m of publicMethods) expect(m[2], m[1]).toMatch(/^p: Progress/);
  });

  it("nothing outside packages/core/src imports the schema/table layer or core internals", () => {
    const files = [
      ...walk(join(repoRoot, "apps")),
      ...walk(join(repoRoot, "packages")),
    ].filter((f) => !f.startsWith(coreSrc) && !f.startsWith(join(repoRoot, "packages/core/test")));
    const offenders: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const m of text.matchAll(/from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)) {
        const spec = m[1] ?? m[2] ?? "";
        const deep = /^@mentalist\/core\/.+/.test(spec);
        const rel = spec.startsWith(".") && resolve(dirname(f), spec).startsWith(coreSrc);
        if (deep || rel) offenders.push(`${relative(repoRoot, f)} -> ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("raw SQL against table names appears only inside packages/core/src", () => {
    const files = [...walk(join(repoRoot, "apps")), ...walk(join(repoRoot, "packages"))]
      .filter((f) => !f.startsWith(coreSrc) && !f.startsWith(join(repoRoot, "packages/core/test")));
    const offenders = files.filter((f) =>
      /\b(FROM|JOIN|INSERT INTO|UPDATE)\s+(claim|entity|episode|arc_item|theory|claim_fts)\b/i.test(readFileSync(f, "utf8")),
    );
    expect(offenders.map((f) => relative(repoRoot, f))).toEqual([]);
  });
});
