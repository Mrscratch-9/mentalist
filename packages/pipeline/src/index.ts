import { existsSync, renameSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { loadDataset, type Dataset } from "@mentalist/core";
import { compile } from "./compile.ts";
import { nodeDriver } from "./driver.ts";
import { EnvError, type PipelineError } from "./errors.ts";
import { resolveI18n, textHash } from "./i18n.ts";
import { loadDir } from "./load.ts";
import { validate } from "./validate.ts";

export { compile, loadDir, resolveI18n, textHash, validate };
export type { LoadedDoc, LoadedI18n } from "./load.ts";
export { formatError, UsageError, EnvError, type PipelineError } from "./errors.ts";

/** `warnings`: problems that do not stop the build (stale translations: rule `i18n.stale`, `detail` = "<lang> <key> <field>"). */
export interface BuildResult { errors: PipelineError[]; warnings: PipelineError[]; dataset?: Dataset }

/** Warnings always show their keys (never text): `warning: file: path: rule (detail)`. */
export const formatWarning = (w: PipelineError): string => `warning: ${w.file}: ${w.path}: ${w.rule}${w.detail ? ` (${w.detail})` : ""}`;

const refuse = (out: string) => new EnvError(`${out} already exists (use --force to overwrite)`);

/** Write a dataset to a SQLite file via a temp file + rename. Refuses to overwrite without `force`. */
export function writeDatabase(data: Dataset, out: string, force: boolean): void {
  if (existsSync(out) && !force) throw refuse(out);
  const tmp = `${out}.tmp-${process.pid}`;
  try {
    const db = new DatabaseSync(tmp);
    try { loadDataset(nodeDriver(db), data); } finally { db.close(); }
    renameSync(tmp, out);
  } finally {
    rmSync(tmp, { force: true });
  }
}

/** Load → validate → compile → write. Nothing is written when there are errors. */
export function buildDatabase(inDir: string, out: string, opts: { force: boolean }): BuildResult {
  if (existsSync(out) && !opts.force) throw refuse(out);
  const { docs, i18n, errors: loadErrors } = loadDir(inDir);
  const errors = loadErrors.length ? loadErrors : validate(docs, i18n);
  if (errors.length) return { errors, warnings: [] };
  const dataset = compile(docs, i18n);
  writeDatabase(dataset, out, opts.force);
  return { errors, warnings: resolveI18n(docs, i18n).stale, dataset };
}
