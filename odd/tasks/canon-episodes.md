# Phase 4, slice C: first real canon (episode list) loaded in the desktop app

Feature: author the real episode list of the series as canon YAML with sources, compile it with `packages/pipeline`, load the compiled database in `apps/desktop` through SQLite WASM, show the episode list gated by the owner's progress, then port the Red room home. Also fix the minor findings of the data-pipeline verification. Agreed design: `docs/design.md` §1, §3, §5, §6 (L12).

## Specs

- S1: "arranca con eso ahora y tambien corrige los detalles menores" — "eso" = "cargar los datos reales hasta el 6x09, hacer que la app lea la base y pasar la "Red room" a la app."
- S2: Minor findings to fix (verifier, verbatim): "Every message for an already-existing output also prints the Usage line (`cli.ts:33`)." and "`load.ts:28-31`: if one input file can't be read (for example, a directory named `x.yaml`), it is reported as `yaml.parse` with exit 1. The README says an unreadable input should exit 2." plus the 4 regression tests the verifier proposed (self supersede, superseded equal to revealed, empty source without leak, deterministic ids).
- S3: `docs/design.md` §1: "Unwatched episodes | Season, episode number, title and synopsis are shown. Nothing else about them." and owner L2 of the foundation: "3 temporada y epsidoio y nombre y la sinpsis".
- S4: `docs/design.md` §1: "The agent researches series data; every fact must cite a source ("100% faithful")." Every episode has a source.
- S5: Owner progress: watched through S6E9 ("recien comence el 6x10"). The owner must not see unwatched data outside the app's gating.
- S6: Red room direction: `design/mentalist-home/02-red-room.html` (chosen), prototyped in `spike/src/redroom/` (S7 of the foundation).

## Tasks

- T1 [S2] Pipeline minor fixes + 4 regression tests. Route: worker (parallel with T2). Commit: 08697f9. Done.
- T2 [S3, S4, S5] `data/canon/episodes-*.yaml`: every episode of the series in broadcast order (code, title, a short spoiler-light synopsis written in our own words, details), one `episode` source per episode pointing at a public reference. Route: worker (parallel with T1). Commit: 34c03d3. Done: 151 episodes (23/23/24/24/22/22/13), source = English Wikipedia episode list; synopses from S6E10 on spot-checked by the parent (premise only).
- T3 [S3, S5] `apps/desktop`: build the canon database before dev/build, load it with SQLite WASM through a `SqlDriver`, resolve the owner's progress with `resolveProgress`, show the episode list through `KnowledgeEngine.listEpisodes` (unwatched episodes expose only season, number, title, synopsis). Route: worker. Commit: 3dfa643 (build step) + 4d54c4e + 23f9511 (review follow-ups). Done: native review approved (lineage review-f6b2876eedfe4ef4); headless Chromium with the Tauri CSP: 151 episodes, 26 unwatched at S6E9, no errors or external requests.
- T4 [S6] Port the Red room home onto `apps/desktop` + `core` (map, legend, case rail with real gated data or empty states). Route: worker. Commit: 7a24005 (deps) + 87e440f + 87ed70a (review follow-ups). Done: native review approved (lineage review-d96bcbde7dedc140); offline basemap without labels; CSP adds only `worker-src 'self' blob:`.

## Log

- L1: "arranca con eso ahora y tambien corrige los detalles menores" (2026-11-23).
- L2: Decisions: synopses are our own one- or two-sentence case premise (no copied text, no arc reveals, no character fates) because unwatched synopses are shown by design; `details` stays empty in this slice (no gated episode facts yet). Canon files are spoilers for the owner: the owner is told not to open `data/canon/`. Compiled `.sqlite` files are build output, not committed.
- L3: Independent verification (gentle-ai-verify, Risk item 2) at 87ed70a: S1-S6 met. Built UI with the Tauri CSP: 0 errors, 0 external requests, 151 episodes / 26 unwatched at S6E9, peek 25 and not persisted, basemap fallback notice works. Each CSP relaxation tested as required except `style-src 'unsafe-inline'` (pre-existing from slice A, kept until it can be tested inside Tauri). Follow-ups: README CSP note, real-canon count test (`packages/pipeline/test/canon-data.test.ts`).
- L4: Not done: no cases, characters or map pins yet (canon has only episodes); street labels dropped from the basemap (no offline glyphs); the app was not run inside the Tauri window in this slice.
