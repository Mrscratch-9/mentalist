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
export class UsageError extends Error {}
