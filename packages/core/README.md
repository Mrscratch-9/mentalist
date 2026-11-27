# @mentalist/core

Spoiler-gated knowledge engine (docs/design.md §2-§6). Pure TypeScript, platform-agnostic.

- `KnowledgeEngine(db: SqlDriver)`: every query takes a `Progress` first (`progress(n)`, global `ep_index`, inclusive).
- `resolveProgress(db, {season, episode})`, `endOfSeason(db, season)`: user state (season + episode) to `Progress`.
- `peek(p)`: `p+1`, never persisted. `cacheKey(scope, p, ...)`: client cache keys must include `p`.
- `loadDataset(db, dataset)`: creates the schema (incl. per-claim FTS5 index) and inserts data. Tables are internal.
- `SqlDriver`: `all/get/exec` with positional `?1..` params; SQLite WASM in the app, `node:sqlite` in tests.
- Errors are constant-message (`NotFoundError` "Not found", `InvalidInputError`) and never echo data.

Tests: per-vector L1-L15 (`test/leaks.test.ts`), property-based canary (`test/canary.test.ts`), architecture (`test/architecture.test.ts`). Fixtures are synthetic.

## Languages (T1a)

Canon text is authored in English; translations are optional and per field.

- `new KnowledgeEngine(db, lang = "en")` and `inLanguage(engine, lang)` (a sibling engine on the same database; the same engine when it already has `lang`). `engine.lang` is the language. A region tag is reduced to its base language (`"es-MX"` -> `"es"`); anything else throws `InvalidInputError`. Every query keeps its signature (`Progress` first); the language is a property of the engine, not an argument, so existing callers are unchanged and get English.
- Translatable fields: claim `value` / `note`, theory `title` / `body`, episode `title` / `synopsis`. A text is the translation when one exists, else the English text. Views say which: `ClaimView.valueLang` / `noteLang`, `EpisodeView.titleLang` / `synopsisLang`, `TheoryView.titleLang` / `bodyLang`, `SearchResult.hits[].lang` (`"en"` for a fallback).
- Never translated: episode `details`, arc narratives, and the `value` of the predicates in `NON_TEXT_PREDICATES` (`role_in_case`, `coordinates`, `recurring`, `team_base`, `red_john_smiley`), because code reads them.
- Gating is unchanged: a translation is read only through the visible row it belongs to, so a translation of an item hidden at `p` is never returned (the canary test runs every query in `es` too).
- Search: in a non-English engine a claim matches on its English text or on its translated text (value and note, English where a field has no translation); filtering is in the same query, `total` counts visible claims once, and the snippet comes from the translation when that matched.
- Data: `Dataset.translations?: Translation[]` (`{ targetId, field, lang, text }`). `targetId` is the opaque claim / theory id; episodes have no opaque id, so it is `episodeTargetId(epIndex)`. Tables `translation` and `translation_fts` are internal. Authoring and stale handling: `packages/pipeline/README.md`.
