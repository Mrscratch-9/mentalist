# @mentalist/desktop

Tauri 2 + React + Vite shell. The home is the "Red room" (`design/mentalist-home/02-red-room.html`):
a 3D night map of California and Austin (opening on the team's current base), the progress gate, a case rail, a legend and a characters strip. The
episode list is under the **Episodes** tab.

- `pnpm dev` / `pnpm tauri dev`: run the app (`pnpm canon` compiles `public/canon.sqlite` first)
- `pnpm test`: Vitest (progress store, canon loading, home view models)
- App icon: source `assets/icon.svg` (original red smiley, also `public/favicon.svg`); rasterize to a 1024 PNG and run `pnpm tauri icon <png>` to regenerate `src-tauri/icons/*`.
- Fonts (Inter 300/400/500/600, Courier Prime) are bundled via @fontsource, no network.
- Progress lives in `src/state/progress.ts` (owner configured: season 6, episode 10). Peek (`core.peek()`,
  p+1) is React state only and is never written to storage.

## Data flow (no UI code touches tables)

`src/home/viewModel.ts` turns `KnowledgeEngine` views at one `Progress` into the rail, legend, pin and
character models. Map pins come from `getMap(p)`, cases from `getCaseFile(p, …)`, characters from visible
`person` entities with a current `recurring` claim; counts are lengths of visible rows. With no entities or claims the surfaces render
designed empty states. Claim conventions the home reads: `name`, `description`, `role` (value claims),
`coordinates`, `red_john_smiley` (marks a Red John pin), `part_of_case` (pin → case), `role_in_case`
(a visible `perpetrator` marks a case solved), `recurring` (value `"true"` on a person lists them in the characters strip; one-off victims and suspects stay case people),
`team_base` (value `"true"` on a `location`: the team's base; the camera opens on the visible location whose `team_base` claim is current and that has valid `coordinates`, and moves when progress or peek changes it. A move is a new `team_base` claim that supersedes the old one, never an edit; with no base the camera opens on Sacramento. Implemented by `currentBase` in `viewModel.ts`). Smileys and solved-case silhouettes appear only when backed by visible claims.

## Offline basemap

The 3D map is MapLibre + deck.gl over two local PMTiles extracts, California (z0-z13, about 267 MB) and the Austin metro area (z0-z13, about 8.5 MB), rendered with the same night style (one vector source per file, layer ids prefixed by the source). The files are
**never loaded whole**: pmtiles reads it with HTTP `Range` requests (`FetchSource`).

- Browser / `pnpm dev`: Vite serves `/tiles/california.pmtiles` and `/tiles/austin.pmtiles` (static server, honors `Range`).
- Tauri: the file is a bundled resource (`bundle.resources` -> `tiles/`) served by the
  `tiles://` custom protocol in `src-tauri/src/tiles.rs` (`http://tiles.localhost/...` on Windows). It answers
  `206` with `Content-Range`, reads only the requested bytes (seek + read, 4 MiB cap per response: enough for the PMTiles header, directories and any z0-z13 tile; a larger request gets a shorter `206`), answers `416`
  for missing/bad ranges, and serves only plain file names inside the bundled `tiles` directory (no traversal).
  Requests run on a fixed pool of 8 worker threads (peak response memory 8 x 4 MiB = 32 MiB), not a thread per request.
  In release builds only the bundled `tiles` resource is read; debug builds fall back to `public/tiles` in the checkout.
  The Tauri asset protocol was not used because it ignores `Range`. `cargo test` covers range parsing and the path check.
- `vite build` removes `dist/tiles` so the extract is not also embedded in the executable.

Camera: opens on the team's current base (3D tilt; downtown Sacramento before the move to Austin, Austin after it, Sacramento when there is no `team_base` claim) and flies to the new base when progress or peek changes it; zoom out (min 4.5) to frame California and Austin together; `maxBounds` is the union of both extracts plus a margin (so both regions fit in a 1440x900 window); the user can pan a little past the
extracts (dark background, no tiles). Past z13 the tiles overzoom.

Nothing is requested from the network: the style has no `glyphs`/`sprite` and no symbol (label/icon)
layers, so no glyph PBFs or sprites are needed or vendored. Pin labels are drawn by deck.gl on a canvas,
and pin icons are passed to deck.gl as a pre-decoded canvas atlas (not data: URLs).

`public/tiles/*.pmtiles` is gitignored. Each extract is bundled through its own glob (`public/tiles/california.*`, `public/tiles/austin.*`); when one is missing, `build.rs` writes a placeholder
`public/tiles/<name>.missing` (removed again once the extract exists) so `cargo check`, `tauri dev` and `tauri build` still work. Each extract is checked on its own: a missing one only leaves its region without tiles, and the basemap notice shows only when both fail. Regenerate the extract with the
[go-pmtiles](https://github.com/protomaps/go-pmtiles) CLI (pick a recent build date from https://maps.protomaps.com/builds/):

```bash
pmtiles extract https://build.protomaps.com/<YYYYMMDD>.pmtiles apps/desktop/public/tiles/california.pmtiles   --bbox=-124.5,32.5,-114.1,42.1 --maxzoom=13
pmtiles extract https://build.protomaps.com/<YYYYMMDD>.pmtiles apps/desktop/public/tiles/austin.pmtiles       --bbox=-98.1,30.05,-97.45,30.55 --maxzoom=13
```

Austin (build 20261123, z13): 338 tiles, 8.5 MB.

Size by `--maxzoom` (build 20261123): z12 = 102 MB, z13 = 267 MB (used), z14 = 636 MB (over budget).

The first ranged read is checked for the `PMTiles` magic bytes, so a dev server answering a missing file with `index.html` (200) counts as missing, and a MapLibre error on the basemap source shows the same notice.
Without the file the app still works: the map shows a notice and the legend panel lists the pins.
`maplibre-gl` is pinned to 5.24.1 on purpose: deck.gl 9.4 breaks on MapLibre 6.

## CSP (`src-tauri/tauri.conf.json`)

Strict by default; the only additions over the plain app policy:

- `script-src 'self' 'wasm-unsafe-eval'`: SQLite WASM compiles its module at runtime.
  Verified in headless Chromium: without it the canon database cannot be loaded (`script-src wasm-eval`).
- `connect-src ... http://tiles.localhost tiles://localhost`: the ranged `tiles://` protocol that serves the local
  PMTiles file (`http://tiles.localhost` is the Windows/Android form, `tiles://localhost` macOS/Linux). Local app protocol only, no remote host.
- `worker-src 'self' blob:`: MapLibre starts its tile-decoding worker from a blob URL.
  Verified in headless Chromium: without it the worker is blocked (`worker-src blob`).

`img-src data:` was already there (inline SVG). 
