# Phase 4, slice B: data pipeline (YAML → validator → compiled SQLite)

Feature: `packages/pipeline` turns authored YAML canon files into a validated `Dataset` (the type `@mentalist/core` already loads) and a compiled read-only SQLite file. No real series data in this slice: tests use synthetic fixtures only. Agreed design: `docs/design.md` §3 (data model) and §5 (data pipeline).

## Specs

- S1: "hola, continua con la tareas que siguen pendientes" — the pending step after the product foundation is `docs/design.md` §8 step 4: "port the Red room home into `apps/desktop` on top of `core`, then the data pipeline (YAML → validator → compiled SQLite) and the first episodes up to the owner's progress." The pipeline goes first: the Red room needs data to show anything.
- S2: `docs/design.md` §5, verbatim: "YAML files in git → validator (Zod + consistency rules) → compiled read-only SQLite shipped inside the app." and "Build-time checks: `revealed_in ≥ introduced_in` of subject and object; `superseded_in > revealed_in`; source required; no cycles in `superseded_by`; arc item ordering rule."
- S3: `docs/design.md` §3.1: "IDs are opaque and non-sequential (no meaningful slugs, no counters)." Authors write readable keys; the compiler emits opaque IDs.
- S4: `docs/design.md` §3.2: "`source_id` is mandatory. Primary source: the episode (scene when possible). Wikis are secondary."
- S5: No series spoilers in examples or fixtures (foundation S4): fixtures are synthetic. The owner cannot review raw data beyond their progress (`docs/design.md` §1 key insight), so validator errors name the file, the record position and the rule, never a record's text or key unless `--verbose` is passed.

## Tasks

- T1 [S1-S5] `packages/pipeline`: Zod authoring schema, consistency validator, compiler to `Dataset` with opaque IDs, SQLite writer (via `loadDataset` of `@mentalist/core` on `node:sqlite`), CLI `pnpm data:build <in-dir> <out.sqlite>`, tests. Route: worker (context backstop). Commit: fa8d248 (manifest 0e47d6f). Done: 44 tests; native review approved (lineage review-d3e8c75eb19b1e8d) with 3 advisory findings → T3.
- T2 [S1] Docs: `docs/design.md` §5 authoring format and §8 next steps. Route: inline. Commit: the "docs: record data pipeline" commit. Done.
- T3 [S2, S5] Review follow-ups: duplicate arc orders / arc blocks rejected by the validator, I/O failures exit 2 without a stack trace, missing CLI tests (YAML parse error, multi-file merge order, `.yml`, failed run with `--force`, temp file removed on write failure). Route: worker (context backstop). Commit: pending.
- T4 [S1] Owner progress update (L3). Route: inline. Commit: 2819c30. Done.

## Log

- L1: "hola, continua con la tareas que siguen pendientes" (2026-11-23, after the review of a0c8a25 and fix 2554946 on main).
- L2: Decisions: pipeline before the Red room port (needs data). Authoring format uses episode codes (`S1E3`) instead of `ep_index`; the compiler derives `ep_index` from the episode list order. Opaque IDs = truncated SHA-256 of a namespaced author key. Errors are spoiler-safe by default (S5).
- L3: "respecto a la temporada hubo un avanze y recien comence el 6x10" — owner progress is now watched through S6E9 inclusive (6x10 started, not finished). `OWNER_PROGRESS` updated to `{ season: 6, episode: 9 }`; a value already saved in the app's localStorage still wins, changeable from the home form.
