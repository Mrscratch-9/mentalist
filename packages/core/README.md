# @mentalist/core

Spoiler-gated knowledge engine (docs/design.md §2-§6). Pure TypeScript, platform-agnostic.

- `KnowledgeEngine(db: SqlDriver)`: every query takes a `Progress` first (`progress(n)`, global `ep_index`, inclusive).
- `resolveProgress(db, {season, episode})`, `endOfSeason(db, season)`: user state (season + episode) to `Progress`.
- `peek(p)`: `p+1`, never persisted. `cacheKey(scope, p, ...)`: client cache keys must include `p`.
- `loadDataset(db, dataset)`: creates the schema (incl. per-claim FTS5 index) and inserts data. Tables are internal.
- `SqlDriver`: `all/get/exec` with positional `?1..` params; SQLite WASM in the app, `node:sqlite` in tests.
- Errors are constant-message (`NotFoundError` "Not found", `InvalidInputError`) and never echo data.

Tests: per-vector L1-L15 (`test/leaks.test.ts`), property-based canary (`test/canary.test.ts`), architecture (`test/architecture.test.ts`). Fixtures are synthetic.
