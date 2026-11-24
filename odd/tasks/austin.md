# Phase 4, slice F: Austin, Texas on the map

Feature: the series moves to Austin, Texas from S6E9; add the team's bases as sourced places (CBI headquarters in Sacramento, then the FBI office in Austin) and an Austin basemap so the map covers both, opening on the team's current base for the viewer's progress.

## Specs

- S1: "pero aparte de california falataria texax o austin o no que es donde se desorrala la seria ahora  a partir de la temporada 6 episodio 9"
- S2: Owner progress S6E10: nothing about S6E11 or later.
- S3: Bases are claims (`docs/design.md` §3.2-§3.3): the move is a new claim that supersedes the old one, never an edit. Convention: predicate `team_base`, value `"true"`, on a `location`; the Sacramento base claim is `superseded` in the episode the move is revealed, by the Austin base claim. Every claim cites the episode source (or an episode-bound wiki source) of its reveal episode; coordinates are the city's Wikipedia API coordinates with note `city-level` (or `landmark` for a real named building).
- S4: Basemap: keep `california.pmtiles`; add an Austin-area extract read through the same `tiles://` range protocol (no full-file loads; RAM < 700 MB), rendered with the same night style; pan limits cover both regions.
- S5: Camera opens on the location with the current `team_base` claim at the viewer's progress (Sacramento before the move, Austin after; peek follows the same rule, never persisted); fallback: Sacramento.

## Tasks

- T1 [S2, S3] `data/canon/core.yaml`: CBI headquarters (Sacramento) and FBI office (Austin) as recurring locations with `name`, `coordinates`, `team_base` claims and the supersession at the move episode, sourced. Route: worker (parallel with T2). Commit: pending.
- T2 [S4, S5] `apps/desktop`: Austin extract + multi-source map, pan bounds for both regions, camera on the current base (view-model function with tests), README (extract command, `team_base` convention). Route: worker (parallel with T1). Commit: pending.

## Log

- L1: Owner request 2026-11-24, after slice E (main 5bdc6e7): "pero aparte de california falataria texax o austin o no que es donde se desorrala la seria ahora  a partir de la temporada 6 episodio 9".
