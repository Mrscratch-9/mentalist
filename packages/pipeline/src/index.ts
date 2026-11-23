import { existsSync, renameSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { loadDataset, type Dataset } from "@mentalist/core";
import { compile } from "./compile.ts";
import { nodeDriver } from "./driver.ts";
import { EnvError, type PipelineError } from "./errors.ts";
import { loadDir } from "./load.ts";
import { validate } from "./validate.ts";

export { compile, loadDir, validate };
export { formatError, UsageError, EnvError, type PipelineError } from "./errors.ts";

export interface BuildResult { errors: PipelineError[]; dataset?: Dataset }

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
  const { docs, errors: loadErrors } = loadDir(inDir);
  const errors = loadErrors.length ? loadErrors : validate(docs);
  if (errors.length) return { errors };
  const dataset = compile(docs);
  writeDatabase(dataset, out, opts.force);
  return { errors, dataset };
}
