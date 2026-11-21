import { InvalidInputError } from "./errors.ts";

declare const progressBrand: unique symbol;

/**
 * Watched through global episode `epIndex`, inclusive. 0 = nothing watched.
 * Every engine query requires one. It is a plain value, never persisted by core.
 */
export interface Progress {
  readonly epIndex: number;
  readonly [progressBrand]: true;
}

export function progress(epIndex: number): Progress {
  if (!Number.isInteger(epIndex) || epIndex < 0) throw new InvalidInputError("progress");
  return Object.freeze({ epIndex }) as unknown as Progress;
}

/** Peek (L15): the same queries at p+1. A new value; nothing is stored or mutated. */
export function peek(p: Progress): Progress {
  return progress(assertProgress(p) + 1);
}

/** Runtime guard for callers that bypass the types. Returns the epIndex. */
export function assertProgress(p: unknown): number {
  const v = (p as { epIndex?: unknown } | null | undefined)?.epIndex;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) throw new InvalidInputError("progress");
  return v;
}

/**
 * Client cache keys must include p (L13): lowering progress can never serve
 * a result computed at a higher p.
 */
export function cacheKey(scope: string, p: Progress, ...parts: Array<string | number>): string {
  return [scope, `p=${assertProgress(p)}`, ...parts.map(String)].join("|");
}
