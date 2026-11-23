import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { Doc } from "./schema.ts";
import { UsageError, type PipelineError } from "./errors.ts";

export interface LoadedDoc { file: string; doc: Doc }

const fmtPath = (p: PropertyKey[]): string =>
  p.map((s, i) => (typeof s === "number" ? `[${s}]` : i ? `.${String(s)}` : String(s))).join("") || "$";

/** Read and schema-check every *.yaml / *.yml file of a directory (sorted by name). */
export function loadDir(dir: string): { docs: LoadedDoc[]; errors: PipelineError[] } {
  let files: string[];
  try {
    if (!statSync(dir).isDirectory()) throw new Error();
    files = readdirSync(dir).filter((f) => /\.ya?ml$/i.test(f)).sort();
  } catch {
    throw new UsageError(`input directory not readable: ${dir}`);
  }
  if (!files.length) throw new UsageError(`no .yaml files in ${dir}`);
  const docs: LoadedDoc[] = [];
  const errors: PipelineError[] = [];
  for (const file of files) {
    let raw: unknown;
    try {
      raw = parse(readFileSync(join(dir, file), "utf8")) ?? {};
    } catch (e) {
      errors.push({ file, path: "$", rule: "yaml.parse", detail: (e as Error).message });
      continue;
    }
    const res = Doc.safeParse(raw);
    if (res.success) docs.push({ file, doc: res.data });
    else for (const i of res.error.issues) errors.push({ file, path: fmtPath(i.path), rule: "schema", detail: i.message });
  }
  return { docs, errors };
}
