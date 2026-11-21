# Phase 4, slice A: product foundation (monorepo, spoiler engine, desktop shell)

Feature: create the product monorepo with `packages/core` (the spoiler-gated knowledge engine and its canary tests) and `apps/desktop` (Tauri 2 + React shell with the owner's progress configured). No series data yet. Agreed design: `docs/design.md` §2-§7.

## Specs

- S1: Option chosen: "empieza con a", where A = "Primero creo la estructura del proyecto: la app de escritorio (`apps/desktop`) y el sistema que evita spoilers (`packages/core`) con sus tests. Todavía sin datos de la serie, y ya con tu límite configurado."
- S2: Owner's watch progress: "acabo de la terminar la temporada 5" — progress = watched through the last episode of season 5, inclusive.
- S3: The engine follows `docs/design.md` §3-§4 exactly: entities are identity only, facts are claims with `revealed_in`, `superseded_in`/`superseded_by`, `status ∈ confirmed | in_show_suspicion`; every query **requires** a `Progress`; peek = same query with `p+1`, never persisted; UI never touches tables (architecture test).
- S4: Leak vectors L1-L15 and the canary test of `docs/design.md` §6: fixture where every field carries a `CANARY_EP_n` token; for many `p` (property-based) every `core` query returns no token with `n > p`.
- S5: Typography (foundation S8, `docs/design.md` §7 Typography): Inter 300/500 uppercase wide tracking for titles, Inter 400/600 for UI, Courier Prime for case files, bundled offline.
- S6: No series spoilers in examples or fixtures (foundation S4): fixtures are synthetic (`CANARY_EP_n`, invented names), never real series facts.

## Tasks

- T1 [S1] Monorepo root: pnpm workspaces (`apps/*`, `packages/*`), shared `tsconfig.base.json`, Vitest, root scripts (`test`, `typecheck`). Route: inline. Commit: 127a627. Done.
- T2 [S3, S4, S6] `packages/core`: domain types, SQL driver interface, schema DDL, knowledge engine (visible entities/claims/episodes, effective status, supersession, peek, uniform not-found), canary fixture + property-based canary test, architecture test. Tests run on `node:sqlite` (FTS5 verified). Route: worker (parallel with T3). Commit: a0c8a25. Done: 34 core tests, canary over p=0..14 (fast-check, 200 runs).
- T3 [S1, S2, S5] `apps/desktop`: Tauri 2 + React + Vite shell, offline fonts, user-state progress store with the owner's progress (end of season 5) as the configured value, a placeholder home showing progress and "no series data loaded yet". Route: worker (parallel with T2). Commit: d389655. Done: 15 store tests; vite build, cargo check OK.
- T4 [S1-S6] Integrate: root `pnpm test` + typecheck green, Tauri `cargo check`, update `docs/design.md` next steps. Route: inline. Commit: the "docs: close product foundation slice" commit. Done.
- T5 [S1] Follow-ups from native review (advisory, non-blocking): restrictive Tauri CSP instead of `csp: null`; progress store `get`/`set` must return `{ ok: false }` when storage throws; extract and test the text-to-progress parser from `App.tsx`; declare `vitest` in the package devDependencies. Route: inline. Commit: pending.

## Log

- L1: "acabo de la terminar la temporada 5 y empieza con a" (answer to: "¿Hasta qué temporada y episodio viste la serie?" and "¿Cómo empezamos? A. Primero creo la estructura del proyecto ... B. Lo mismo y además cargo los primeros episodios hasta donde viste.").
- L2: Decisions: branch `feat/product-foundation` from `main` 4e42218. Progress is stored as season + episode in user state; mapping to global `ep_index` happens in `core` once episodes exist. `node:sqlite` (Node 26) has FTS5, so core tests need no native module; the app uses SQLite WASM per the spike.
- L3: Verification: root `pnpm test` 49/49 pass, `pnpm typecheck` OK; desktop home rendered headless at 1440x900 with no JS errors and no external requests; `cargo check` OK. Native review of the desktop commit (lineage review-bf08cde3f42b1167, lenses risk + reliability) approved and acknowledged; 4 advisory findings recorded as T5. Core commit was not separately reviewed (assess due reason was the desktop process entry).
