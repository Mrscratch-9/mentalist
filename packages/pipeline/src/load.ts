import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { Doc, I18nDoc } from "./schema.ts";
import { EnvError, UsageError, type PipelineError } from "./errors.ts";

export interface LoadedDoc { file: string; doc: Doc }
/** A translation file: `i18n/<lang>/**.yaml`; `lang` is the directory name. */
export interface LoadedI18n { file: string; lang: string; doc: I18nDoc }

/** Language directory names: a lowercase base language code, never the authoring language. */
const LANG_RE = /^[a-z]{2,3}$/;

const fmtPath = (p: PropertyKey[]): string =>
  p.map((s, i) => (typeof s === "number" ? `[${s}]` : i ? `.${String(s)}` : String(s))).join("") || "$";

/** Every *.yaml / *.yml file under dir, recursively, as forward-slash relative paths sorted by code unit (deterministic on every OS). */
function listYaml(dir: string, rel = ""): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${ent.name}` : ent.name;
    // A yaml-named entry is always read as a file (an unreadable one is reported, never skipped).
    if (/\.ya?ml$/i.test(ent.name)) out.push(r);
    else if (ent.isDirectory()) out.push(...listYaml(dir, r));
  }
  return out;
}

/** Read and schema-check every *.yaml / *.yml file under a directory, recursively (sorted by relative path). */
export function loadDir(dir: string): { docs: LoadedDoc[]; i18n: LoadedI18n[]; errors: PipelineError[] } {
  let files: string[];
  try {
    if (!statSync(dir).isDirectory()) throw new Error();
    files = listYaml(dir).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  } catch {
    throw new UsageError(`input directory not readable: ${dir}`);
  }
  if (!files.length) throw new UsageError(`no .yaml files in ${dir}`);
  const docs: LoadedDoc[] = [];
  const i18n: LoadedI18n[] = [];
  const errors: PipelineError[] = [];
  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(join(dir, file), "utf8");
    } catch {
      throw new EnvError(`input file not readable: ${file}`);
    }
    let raw: unknown;
    try {
      raw = parse(text) ?? {};
    } catch (e) {
      errors.push({ file, path: "$", rule: "yaml.parse", detail: (e as Error).message });
      continue;
    }
    const parts = file.split("/");
    const isI18n = parts[0] === "i18n";
    if (isI18n) {
      const lang = parts[1] ?? "";
      if (parts.length < 3 || !LANG_RE.test(lang) || lang === "en") {
        errors.push({ file, path: "$", rule: "i18n.lang_invalid", detail: lang });
        continue;
      }
      const t = I18nDoc.safeParse(raw);
      if (t.success) i18n.push({ file, lang, doc: t.data });
      else for (const i of t.error.issues) errors.push({ file, path: fmtPath(i.path), rule: "schema", detail: i.message });
      continue;
    }
    const res = Doc.safeParse(raw);
    if (res.success) docs.push({ file, doc: res.data });
    else for (const i of res.error.issues) errors.push({ file, path: fmtPath(i.path), rule: "schema", detail: i.message });
  }
  return { docs, i18n, errors };
}
