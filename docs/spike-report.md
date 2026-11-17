# Foundation spike report

Date: 2026-11-17. Machine: owner's home PC (Windows 11 Pro 26300, WebView2 157, Rust 1.100, Node 26.13).
Code: `spike/` (throwaway). Every check runs inside the release build of the Tauri app, not in a browser,
and writes its result to `checks.json` through a Rust command (`SPIKE_REPORT_DIR`).

## Verdict

| # | Check (from the agreed proposal) | Result | Evidence |
|---|---|---|---|
| 1 | "Que Tauri compile en tu Windows" | **PASS** | Release build in 176 s; MSI 14.1 MiB, NSIS setup 13.6 MiB |
| 2 | "Que SQLite en WebAssembly tenga FTS5 y cargue una base de prueba" | **PASS** | SQLite 3.54.1, `ENABLE_FTS5`; 3.2 MB fixture (20,000 claims) loaded in 1.3–1.8 s; FTS `MATCH` gated by `revealed_in` in ~10 ms, `snippet()` works |
| 3 | "Que MapLibre + deck.gl + un PMTiles regional rendericen dentro de Tauri" | **PASS** (with a version pin) | Sacramento PMTiles (10.9 MB, offline) at 62° pitch: 136 extruded buildings, 2,640 road features, 40 deck.gl columns + icons, first idle ~2.1 s, no errors |
| 4 | Cytoscape (graph) | **PASS** | 300 nodes / 598 edges, cose layout ~1.2 s |
| 5 | "la RAM medida" — "un objetivo de **< 300 MB**" | **FAIL** | 662–677 MB private with everything open; see breakdown |

## RAM

Method: `spike/scripts/measure-ram.ps1` starts the app, waits for the checks, waits 10 s, then sums
the whole process tree (`spike.exe` + its WebView2 processes) over 5 samples. The metric is
**private bytes**: working set double-counts pages shared between WebView2 processes. Run-to-run noise is about ±30 MB.

| Variant | Private MB |
|---|---|
| Empty shell (Tauri + WebView2, no checks) | 174–175 |
| + SQLite (fixture loaded) | 201 |
| + graph | 240 |
| + map, flat (pitch 0, no extrusions) | 377 |
| + map, 3D (62° pitch, extrusions, deck.gl) | 614–662 |
| Everything (SQLite + 3D map + graph) | 677 |

Ruled out as the cause of the map cost (each within noise of the 3D map baseline):

- deck.gl overlay: −20 MB without it.
- MapLibre worker count: already 1 on this machine; forcing 1 or 2 changes nothing.
- Rendering quality (no antialias, no preserved buffer, 1× pixel ratio): no change.
- Tile cache limited to 20 tiles: no change.

**Cause: the tilted 3D view.** At 62° the camera sees to the horizon, so MapLibre loads and keeps on the
GPU far more tiles and the extruded building geometry. It costs ~285 MB over the same map seen flat.
The empty WebView2 shell alone already takes ~175 MB of the 300 MB budget.

## Findings to carry into the product

1. **MapLibre is pinned to 5.x (5.24.1).** deck.gl 9.4 (latest stable) reads `map.transform`, which MapLibre 6 removed
   (`Map` no longer extends `Camera`): every frame threw `Cannot read properties of undefined (reading 'height')`.
   Revisit when deck.gl 10 is stable.
2. **Tauri's asset protocol ignores HTTP `Range`** (returns 200, not 206). PMTiles is loaded fully into memory
   through `FileSource` (~11 MB for the region). Fine for a regional file; a larger one needs a Rust-side range command.
3. MapLibre 6 also needed its worker module emitted explicitly (`setWorkerUrl` + Vite `?worker&url`); not needed on 5.x.
4. Glyphs and sprites still come from the Protomaps CDN; bundle them for fully offline use.

## Decision needed (owner)

The < 300 MB target cannot be met with the 3D map open. Options:

- **A. Raise the target** (e.g. < 700 MB with the 3D map open) and keep 3D always available.
- **B. Load the map on demand**: create it when the map view opens and destroy it on leave.
  The rest of the app stays around 240–280 MB; peaks around 650–700 MB only while the 3D map is open.
- **C. Flat by default, 3D on demand** (a "tilt" toggle): ~380 MB with the map open flat.

**Decided (2026-11-17): A.** Target raised to < 700 MB with the 3D map open; 3D stays always available.

B and C can be combined. Not measured: intermediate pitch values (e.g. 45°) and tile-zoom limits while tilted.
