export type SqlValue = string | number | null;

/**
 * Minimal synchronous SQL driver. Implemented over SQLite WASM in the app and
 * over `node:sqlite` (`DatabaseSync`) in tests. Parameters are positional
 * (`?1`, `?2`, ... may be reused within a statement).
 */
export interface SqlDriver {
  all<T = Record<string, unknown>>(sql: string, params?: SqlValue[]): T[];
  get<T = Record<string, unknown>>(sql: string, params?: SqlValue[]): T | undefined;
  exec(sql: string, params?: SqlValue[]): void;
}
