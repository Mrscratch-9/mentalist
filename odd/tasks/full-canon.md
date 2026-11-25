# Phase 4, slice G: street labels, the whole series, and mentalist.exe

Feature: show street and place labels on the offline map; author canon for every remaining episode (S6E11 to the finale) behind the spoiler engine; then build the Windows app as `mentalist.exe`.

## Specs

- S1: "quiero que la calles aaprezcan y esten todos los episodios indepndiente donde vaya pero con el sistema de anti spoiler es decir no revela a menos que yo llegue o lo marque como visto, por ultimo terminado todo eso arma el mentalist.exe"
- S2: Street labels: offline only (no network at runtime); glyphs vendored into the app under an open font licence; CSP stays strict.
- S3: Remaining canon (S6E11..S7E13) follows the same rules as slices D/E: one case per episode, sourced per reveal episode (`src-sNeM`, or `src-wiki-sNeM` for the fan wiki), coordinates from the Wikipedia API with `city-level`/`landmark` notes, `red_john_smiley` only when the source states the mark, `team_base` changes as superseding claims, new recurring characters only in `core.yaml`.
- S4: Spoiler safety for the owner (progress S6E10): nothing after S6E10 is shown unless the owner's progress or peek reaches it (the engine already gates it); no report, log, commit message, task document or test output written for the owner contains canon text after S6E10 — counts and keys only.
- S5: The final deliverable is a Windows build named `mentalist.exe`, with the map extracts bundled, plus an installer.

## Tasks

- T1 [S2] Offline street/place labels: vendor the glyph ranges the night style needs, restore label layers for both regions. Route: worker (parallel with T2). Commit: pending.
- T2 [S3, S4] `core.yaml`: recurring characters, organizations and team-base changes introduced in S6E11..S7E13. Route: worker (parallel with T1). Commit: pending.
- T3 [S3, S4] `cases-s6.yaml` S6E11..S6E22. Route: worker (after T2, parallel with T4). Commit: pending.
- T4 [S3, S4] `cases-s7.yaml` S7E1..S7E13. Route: worker (after T2, parallel with T3). Commit: pending.
- T5 [S4] Independent verification: gating at S6E10 (nothing after it visible, peek shows only S6E11), data fidelity by sample, labels offline. Route: verifier. Commit: n/a.
- T6 [S5] `mentalist.exe` + installer (release build), smoke-run and RAM. Route: worker. Commit: config only.

## Log

- L1: Owner request 2026-11-24 (main 402455a), quoted in S1. The owner is told not to open data/canon/.
