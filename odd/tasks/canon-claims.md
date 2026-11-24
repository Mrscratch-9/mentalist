# Phase 4, slice D: cases, characters and places up to the owner's progress

Feature: author canon entities and claims (recurring characters, organizations, one case per episode, places with coordinates, Red John appearances) for every episode the owner has watched, so the Red room board, map pins and characters strip fill in. Nothing is authored for unwatched episodes. Agreed design: `docs/design.md` §1, §3, §5; claim conventions in `apps/desktop/README.md`.

## Specs

- S1: "hola, volvi continuemos con lo que queda pendiente ayer acabe de terminar de verme el 6x10" — the pending step is `docs/design.md` §8 step 6: "author entities and claims (cases, characters, places with coordinates) up to the owner's progress, so the board, map pins and characters fill in".
- S2: Owner progress: watched through S6E10 inclusive. Data is authored only for S1E1..S6E10 (every `introduced`/`revealed` ≤ S6E10); nothing about later episodes.
- S3: `docs/design.md` §1: "The agent researches series data; every fact must cite a source ("100% faithful")." Every claim's `source` is the existing per-episode source (`src-sNeM`) of the episode that reveals it. No invented facts: when the reference does not state something (a culprit, a place), it is not authored.
- S4: `docs/design.md` §3.1-§3.4: entities are identity only; names, descriptions, roles, coordinates and relations are claims; `role_in_case ∈ victim | suspect | perpetrator | investigator | witness | accomplice | informant`; a changed belief is a new claim that supersedes the old one, never an edit.
- S5: Home claim conventions (`apps/desktop/README.md`): `name`, `description`, `role` (value claims), `coordinates` (`"lat,lon"`), `red_john_smiley` (marks a Red John pin), `part_of_case` (place → case), `role_in_case` (a visible `perpetrator` marks a case solved).
- S6: Map coordinates: a place gets `coordinates` only when the reference names a real city, town or landmark; the value is that place's public coordinates (city centre for a city) and the claim `note` says `city-level` or `landmark`. Fictional or unnamed places get no pin.
- S7: The owner must not see canon outside the app: workers never print canon text in their reports beyond S1 examples and counts.

## Tasks

- T1 [S1-S5] `data/canon/core.yaml`: recurring characters (person entities introduced at their first episode, `name`, `role`, a short spoiler-light `description`, `recurring: "true"`), organizations (CBI and others introduced ≤ S6E10), the Red John arc entity. Route: worker (first; season files depend on its keys). Commit: pending.
- T2 [S2-S7] `data/canon/cases-s1.yaml` … `cases-s6.yaml` (S6 only E1-E10): one `case` entity per episode with `name`/`description`, people with `role_in_case` (one-off people as person entities without `recurring`), places with `coordinates` and `part_of_case`, `red_john_smiley` on places where the reference says Red John left his mark. Route: workers in parallel, one per season. Commit: pending.
- T3 [S5] `apps/desktop`: characters strip shows only persons with a current `recurring` claim, so one-off victims and suspects do not flood it. Route: inline or worker. Commit: pending.
- T4 [S2, S7] Guards: a canon test that fails if any `introduced`/`revealed` is after S6E10 is NOT wanted long-term (progress moves); instead a test that every claim cites the source of its own reveal episode, plus counts-only checks. Route: inline. Commit: pending.

## Log

- L1: "hola, volvi continuemos con lo que queda pendiente ayer acabe de terminar de verme el 6x10" (2026-11-24). Progress updated to S6E10 in 288c7e4; a value already saved in the app's storage still wins until changed from the home form.
- L2: Decisions: author only watched episodes (S2) so no unwatched data exists at all; coordinates only for real named places with a `city-level`/`landmark` note (S6); recurring characters flagged with a `recurring` claim (T3).
