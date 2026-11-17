# Foundation: design doc, repository and technical spike

Feature: record the agreed design in the repo, initialize git, and run a throwaway spike that validates the chosen stack before any product code. A UI design session follows the spike, still before product coding.

## Specs

- S1: "si arranca con eso" — "eso" = "primero escribo el documento de diseño de las Fases 1 y 3 en el repo, hago `git init` y después armo el spike."
- S2: Spike validates, per the agreed proposal: "Que Tauri compile en tu Windows", "Que SQLite en WebAssembly tenga FTS5 y cargue una base de prueba", "Que MapLibre + deck.gl + un PMTiles regional rendericen dentro de Tauri", and "la RAM medida" with "un objetivo de **< 300 MB**".
- S3: "depues de eso antes de codificar una sesion haz el desing de la app"
- S4: No series spoilers in examples or fixtures; the user's watch progress is asked only before loading series data (Phase 4).

## Tasks

- T1 [S1, S4] Write `docs/design.md` (Phase 1 + Phase 3 decisions, stack), `git init`, initial commit. Route: inline. Commit: 2b8e7c1 (initial) — see Log.
- T2 [S2, S4] Scaffold `spike/` (Tauri 2 + React + Vite + TS): WASM SQLite FTS5 probe, MapLibre + deck.gl + regional PMTiles, Cytoscape, Windows build. Route: inline. Commit: pending.
- T3 [S2] Measure RAM of the built app (process tree incl. WebView2) and write `docs/spike-report.md` with pass/fail per check. Route: inline. Commit: pending.
- T4 [S3] UI design session with gentle-design (directions on the canvas) before product code. Route: inline, needs user input. Commit: pending.

## Log

- L1 (original project brief, 2026-11-17 session 1, stored in Engram prompt #15): "# Proyecto: The Mentalist — Base de datos interactiva e investigación ... No quiero que empieces programando inmediatamente ni que decidas arbitrariamente qué tecnologías utilizar." (full text in Engram; truncated here).
- L2: "1 react lo he ocupado antes es lo mejor para esto, en vez de web lo quiero app de escritorio una vez que yo vea que esta fino se escalaria a movil en una feuture mucho mas adelante, 2 si granualidad, 3 temporada y epsidoio y nombre y la sinpsis, 4 teorias fuera del canon como una seccion gekk o fans cosas que venga de la comunidad con esto dime que es mejor rerspecto al stack antes de comenzar a codear"
- L3: "como esta construyendo en nuevo discor ve como lo estan contruyendo y ver si viable para nosostro por la cargas de ram y eso ahi dame la a opinion y respecto a los mapas busca algo top super top pero opensource"
- L4: "si arranca con eso y depues de eso antes de codificar una sesion haz el desing de la app"
- L5: Environment verified: git 2.56, node 26.13, pnpm 11.1, Rust 1.100 stable-msvc, VS Build Tools 2022 (VC tools), WebView2 157.
