# Foundation: design doc, repository and technical spike

Feature: record the agreed design in the repo, initialize git, and run a throwaway spike that validates the chosen stack before any product code. A UI design session follows the spike, still before product coding.

## Specs

- S1: "si arranca con eso" — "eso" = "primero escribo el documento de diseño de las Fases 1 y 3 en el repo, hago `git init` y después armo el spike."
- S2: Spike validates, per the agreed proposal: "Que Tauri compile en tu Windows", "Que SQLite en WebAssembly tenga FTS5 y cargue una base de prueba", "Que MapLibre + deck.gl + un PMTiles regional rendericen dentro de Tauri", and "la RAM medida" with "un objetivo de **< 300 MB**".
- S3: "depues de eso antes de codificar una sesion haz el desing de la app"
- S4: No series spoilers in examples or fixtures; the user's watch progress is asked only before loading series data (Phase 4).
- S5: Design direction: "lo que busco para el diseno es un diseno unico y especial 100% estilo mentalista, siluetas de cbi o de patrick en los casos que se resolvieron un mapa 3d donde se pueda aprecia la cara sonriente de red jhon en sus crimens o donde aparecio"
- S6: "y para el diseno como dije 100$ estilo el mentalista paleta tipografia todo eso"

## Tasks

- T1 [S1, S4] Write `docs/design.md` (Phase 1 + Phase 3 decisions, stack), `git init`, initial commit. Route: inline. Commit: 03f6dd2 (initial).
- T2 [S2, S4, S5] Scaffold `spike/` (Tauri 2 + React + Vite + TS): WASM SQLite FTS5 probe, MapLibre + deck.gl + regional PMTiles in 3D (pitch, extrusions, custom icon layer), Cytoscape, Windows build. Route: inline. Commit: 634a273 (scaffold) + 118d346. Done: all checks PASS inside Tauri.
- T3 [S2] Measure RAM of the built app (process tree incl. WebView2) and write `docs/spike-report.md` with pass/fail per check. Route: inline. Commit: the "docs: add foundation spike report" commit. Done: RAM FAIL vs < 300 MB (677 MB private); owner chose A, target raised to < 700 MB (L10).
- T4 [S3, S5, S6] UI design session with gentle-design (directions on the canvas) before product code. Route: inline, needs user input. Commit: pending.

## Log

- L1 (original project brief, 2026-11-17 session 1, stored in Engram prompt #15): "# Proyecto: The Mentalist — Base de datos interactiva e investigación ... No quiero que empieces programando inmediatamente ni que decidas arbitrariamente qué tecnologías utilizar." (full text in Engram; truncated here).
- L2: "1 react lo he ocupado antes es lo mejor para esto, en vez de web lo quiero app de escritorio una vez que yo vea que esta fino se escalaria a movil en una feuture mucho mas adelante, 2 si granualidad, 3 temporada y epsidoio y nombre y la sinpsis, 4 teorias fuera del canon como una seccion gekk o fans cosas que venga de la comunidad con esto dime que es mejor rerspecto al stack antes de comenzar a codear"
- L3: "como esta construyendo en nuevo discor ve como lo estan contruyendo y ver si viable para nosostro por la cargas de ram y eso ahi dame la a opinion y respecto a los mapas busca algo top super top pero opensource"
- L4: "si arranca con eso y depues de eso antes de codificar una sesion haz el desing de la app"
- L5: Environment verified: git 2.56, node 26.13, pnpm 11.1, Rust 1.100 stable-msvc, VS Build Tools 2022 (VC tools), WebView2 157.
- L6: "t2 y t3 se hicieron en mi maquina del laburo y pasaron pero hagamosla de nuevo, lo que busco para el diseno es un diseno unico y especial 100% estilo mentalista, siluetas de cbi o de patrick en los casos que se resolvieron un mapa 3d donde se pueda aprecia la cara sonriente de red jhon en sus crimens o donde aparecio"
- L7: Decision: T2 and T3 are redone on this machine (work-machine results not in this repo). T2 also validates the 3D map capabilities S5 needs (pitch/extrusions + deck.gl icon layer). Design note for T4: smiley pins and "solved" silhouettes are claims gated by progress like any map pin (leak vectors L6/L9); silhouettes must be original artwork, not actor likeness. Branch: feat/foundation-spike.
- L8: "y para el diseno como dije 100$ estilo el mentalista paleta tipografia todo eso"
- L9: Spike results (this machine): Tauri build, SQLite FTS5, 3D map + deck.gl, Cytoscape PASS. RAM FAIL: shell 175 MB, flat map 377 MB, 3D map 662 MB, all 677 MB private. Cause: tilted 3D view (~285 MB). MapLibre pinned to 5.24.1 (deck.gl 9.4 breaks on 6). Tauri asset protocol has no HTTP Range.
- L10: Owner decision on RAM: "A. Subir el objetivo" — accept ~700 MB with the 3D map open; 3D always available. Owner also authorized `gentle-ai sync --agent pi` to continue the native review.
- L11: T4 started. Design `design/mentalist-home/` with artboards 01-cbi-case-file.html, 02-red-room.html, 03-sacramento-daylight.html (written by 3 parallel workers). Research: title card is a red smiley drawn in blood; early seasons warm California daylight with film grain; red as the Red John signal. Logo typeface not verified (Wikimedia fetch blocked); artboards use system font stacks per canvas rules.
- L12: Artboards rendered with headless Chromium at 1440x900: no page scroll, no JS errors, no external URLs. One fix round each (01 case-list fit + roster, 02 map/river/characters, 03 legend overlap). Known gap: 02 river still not visible under the buildings (label only). Awaiting owner choice of direction.
