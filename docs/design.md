# The Mentalist — Investigation Platform: Design

Status: agreed design (Phase 1 analysis + Phase 3 data model). No product code yet.
Scope: a personal, local, spoiler-safe interactive database of the series *The Mentalist*.

## 1. Product decisions (Phase 1)

| Decision | Choice |
|---|---|
| Audience | Personal use, local only. No accounts, no server. |
| Platform | Desktop app first. Mobile much later, only after desktop is polished. |
| UI | React (the owner already knows it). |
| Data authoring | The agent researches series data; every fact must cite a source ("100% faithful"). |
| Spoiler unit | Episode. Progress = "watched through episode N, inclusive". |
| Manual reveal | Temporary *peek* (shows progress `p+1`, never persisted) or advance progress. |
| Unwatched episodes | Season, episode number, title and synopsis are shown. Nothing else about them. |
| Fan theories | A separate non-canon "Geek / Fans" section with community content. |

Key insight: the data files are themselves spoilers. The owner cannot review raw data beyond their progress, so correctness must come from source citations and automated validation, never from manual review.

## 2. Two timelines

- **Viewer time** (`revealed_in`): the episode in which the viewer learns something. All spoiler gating uses this.
- **In-universe time** (`occurred_at`, fuzzy): when something happened in the story. Used only for chronologies (flashbacks reveal old events late).

Episodes have a global `ep_index` (1..N from S1E1 to the finale).

## 3. Data model (Phase 3)

### 3.1 Entities: identity only

```
entity(id, kind, introduced_in)
kind ∈ person | organization | location | case | episode | evidence | event | arc
```

- An entity is invisible until `introduced_in` — its existence can be a spoiler.
- IDs are opaque and non-sequential (no meaningful slugs, no counters).
- Names, aliases, descriptions, coordinates and relations are **claims**, not entity columns.

### 3.2 Claims: every fact is a dated assertion

```
claim(id, subject, predicate, object | value,
      revealed_in, superseded_in?, superseded_by?,
      status, source_id, note)
status ∈ confirmed | in_show_suspicion
```

- `in_show_suspicion`: the characters believe it; the show has not confirmed it.
- `source_id` is mandatory. Primary source: the episode (scene when possible). Wikis are secondary.
- Claims are never edited. A change of belief or status is a **new claim** that supersedes the old one.

### 3.3 Retracted beliefs

Claim A (suspicion, `revealed_in=10`, `superseded_in=20`, `superseded_by=B`) and claim B (the truth, `revealed_in=20`):

| Progress p | Visible |
|---|---|
| p < 10 | nothing |
| 10 ≤ p < 20 | A as a current suspicion, **with no hint** that it changes |
| p ≥ 20 | A as "belief discarded in ep 20", linked to B |

### 3.4 Case roles

`role_in_case(person, case, role)` claims, with `role ∈ victim | suspect | perpetrator | investigator | witness | accomplice | informant`. Victims and criminals are people with roles, not entity kinds.

### 3.5 Arcs (Red John, Blake Association)

Curated views over the generic model:

```
arc_item(arc, order, ref → claim | event, narrative_text, revealed_in)
```

Build-time rule: an item's `revealed_in` ≥ the `revealed_in` of everything it references.

### 3.6 Geek / Fans section (non-canon)

```
theory(id, title, body, source_url, author_handle?, spoils_up_to, tags)
```

- Always labeled **non-canon**; never mixed into case files or entity pages.
- Gated by `spoils_up_to` (last episode the theory discusses) through the same engine.

## 4. The knowledge engine ("what is known at episode N")

- One query layer in `packages/core` that **requires** a `Progress` value. No UI code touches tables directly (enforced by an architecture test).
- Parameterized views: visible entities, visible claims (claim **and** its subject/object visible), effective status (`superseded_in ≤ p`).
- Map, graph, search and case files consume only these views. Coordinates are claims, so a hidden place has no pin.
- Peek = the same query with `p+1`, not persisted.

## 5. Data pipeline

YAML files in git → validator (Zod + consistency rules) → compiled read-only SQLite shipped inside the app.

Implemented in `packages/pipeline` (`pnpm data:build <in-dir> <out.sqlite> [--force] [--verbose]`). Authors write readable keys and episode codes (`S1E3`); the compiler derives `ep_index` from episode order and emits opaque IDs (truncated SHA-256 of a namespaced key). Validator errors name only file, record path and rule, never record text, unless `--verbose` (the owner must not see future data). Authoring format and rule codes: `packages/pipeline/README.md`.

Build-time checks: `revealed_in ≥ introduced_in` of subject and object; `superseded_in > revealed_in`; source required; no cycles in `superseded_by`; arc item ordering rule.

## 6. Leak vectors and tests

| # | Vector | Test idea |
|---|---|---|
| L1 | Entity existence (lists, autocomplete, "hidden" vs "not found") | hidden ID returns the same not-found as a nonexistent ID |
| L2 | Names and aliases | future alias absent |
| L3 | Claim content | future claim absent |
| L4 | Early "discarded" marker | no `superseded_*` visible before `superseded_in` |
| L5 | Suspicion → confirmed upgrade | upgraded status absent before reveal |
| L6 | Counts and aggregates | counts computed only from visible rows |
| L7 | Search: results, snippets, ranking, hit totals | FTS indexed per claim, filtered in the same query |
| L8 | Graph edges and node degree | edges only from visible claims |
| L9 | Map pins, coordinates, filter options | pins and filter values only from visible claims |
| L10 | Arc ordering and narrative | arc items gated |
| L11 | Spoiler-revealing IDs/slugs | opaque IDs |
| L12 | Unwatched episodes | only season, number, title, synopsis exposed |
| L13 | Client cache after lowering progress | cache keys include `p` |
| L14 | Error messages | errors never echo hidden data |
| L15 | Peek persistence | peek never persisted |

Global strategy — **canary test**: a fixture dataset where every field carries a `CANARY_EP_n` token. For many values of `p` (property-based), call every `core` query and assert no token with `n > p` appears. Timing and response-size side channels are out of scope (personal local app).

## 7. Stack

| Layer | Choice |
|---|---|
| Desktop shell | Tauri 2 (system WebView2 on Windows; iOS/Android targets later) |
| UI | React + Vite + TypeScript |
| Spoiler engine | `packages/core`, pure TypeScript over a SQLite driver interface (platform-agnostic) |
| Canon database | Read-only compiled SQLite, loaded via SQLite WASM with FTS5 |
| User state | Small separate writable store (progress, preferences) |
| Validation | Zod |
| Map | MapLibre GL JS 5.x (pinned: deck.gl 9.4 is incompatible with 6) + Protomaps basemap as a regional PMTiles file bundled offline + deck.gl analytic layers |
| Graph | Cytoscape.js |
| Tests | Vitest (+ property-based tests for the canary) |
| Monorepo | pnpm workspaces |

No server: the earlier Hono API was dropped when the target became desktop. The threat model is accidental UI leakage, not an adversary, so having the database in app memory is acceptable; the `core` boundary and canary tests enforce gating.

### Typography

The show's title card uses Helvetica Neue (Medium and Light, uppercase, slightly wide letter spacing). It needs a paid commercial license, so the app ships free (SIL OFL) neo-grotesque alternatives, bundled offline (no CDN):

| Role | Font | Use |
|---|---|---|
| Titles and logo | Inter, weights 300 and 500 | Uppercase, letter spacing ~0.08em, the Helvetica Neue look |
| UI and reading | Inter, weights 400 and 600 | Menus, case cards, long synopses |
| Case files (optional) | Courier Prime | CBI reports, Patrick Jane's notes, evidence |

One family for titles and UI keeps the bundle small. Alternatives considered: Work Sans, Roboto (titles); Plus Jakarta Sans (UI); IBM Plex Mono (case files).

### Rejected alternatives

- **Electron**: all-TS and simple, but heavier (bundled Chromium) and no mobile path.
- **Rust + GPUI (Discord's Nov 2026 rewrite)**: lowest RAM, but no React, UI in Rust, and no map/graph libraries. Adopted lesson: one shared platform-agnostic core with a thin shell per platform.
- **Maps**: Cesium (heavy 3D GIS), OpenLayers (GIS-oriented, less visual), Leaflet (no 3D, no vector styling).

## 8. Next steps

1. Technical spike (`spike/`, throwaway): done, see `docs/spike-report.md`. All stack checks pass; RAM target raised to < 700 MB with the 3D map open (owner decision).
2. UI design session before product code: done, direction `design/mentalist-home/02-red-room.html` chosen and prototyped in the spike.
3. Phase 4, slice A: done. Monorepo with `packages/core` (spoiler-gated knowledge engine, canary tests) and `apps/desktop` (Tauri shell, offline fonts, progress store). Owner progress at the time: end of season 5.
4. Phase 4, slice B: done. Data pipeline `packages/pipeline` (YAML → validator → compiled SQLite). Owner progress: season 6, episode 9.
5. Phase 4, slice C: done. Real episode list (151 episodes, sourced) in `data/canon/`, loaded in `apps/desktop` through SQLite WASM; Red room home ported on top of `core` with empty states.
6. Next: author entities and claims (cases, characters, places with coordinates) up to the owner's progress, so the board, map pins and characters fill in; offline glyphs for street labels.
