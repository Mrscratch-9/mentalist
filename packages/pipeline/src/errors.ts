/** Spoiler-safe by default (S5): file, record position and rule only. `detail` is shown with --verbose. */
export interface PipelineError {
  file: string;
  path: string;
  rule: string;
  detail?: string;
}

export const formatError = (e: PipelineError, verbose = false): string =>
  `${e.file}: ${e.path}: ${e.rule}` + (verbose && e.detail ? ` [${e.detail}]` : "");

/** Bad invocation or environment (exit code 2), not a canon problem. */
export class UsageError extends Error {
  /** Print the Usage line too (only for real argument errors). */
  showUsage = true;
}

/** Environment problem (exit code 2) that is not an argument error: no Usage line. */
export class EnvError extends UsageError {
  override showUsage = false;
}
