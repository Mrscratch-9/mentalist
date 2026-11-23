# @mentalist/desktop

Tauri 2 + React + Vite shell. The home is the "Red room" (`design/mentalist-home/02-red-room.html`):
a 3D night map of Sacramento, the progress gate, a case rail, a legend and a characters strip. The
episode list is under the **Episodes** tab.

- `pnpm dev` / `pnpm tauri dev`: run the app (`pnpm canon` compiles `public/canon.sqlite` first)
- `pnpm test`: Vitest (progress store, canon loading, home view models)
- Fonts (Inter 300/400/500/600, Courier Prime) are bundled via @fontsource, no network.
- Progress lives in `src/state/progress.ts` (owner configured: season 6, episode 9). Peek (`core.peek()`,
  p+1) is React state only and is never written to storage.

## Data flow (no UI code touches tables)

`src/home/viewModel.ts` turns `KnowledgeEngine` views at one `Progress` into the rail, legend, pin and
character models. Map pins come from `getMap(p)`, cases from `getCaseFile(p, …)`, characters from visible
`person` entities; counts are lengths of visible rows. With no entities or claims the surfaces render
designed empty states. Claim conventions the home reads: `name`, `description`, `role` (value claims),
`coordinates`, `red_john_smiley` (marks a Red John pin), `part_of_case` (pin → case), `role_in_case`
(a visible `perpetrator` marks a case solved). Smileys and solved-case silhouettes appear only when backed by visible claims.

## Offline basemap

The 3D map is MapLibre + deck.gl over a local PMTiles file, loaded in memory (no HTTP Range in Tauri).
Nothing is requested from the network: the style has no `glyphs`/`sprite` and no symbol (label/icon)
layers, so no glyph PBFs or sprites are needed or vendored. Pin labels are drawn by deck.gl on a canvas,
and pin icons are passed to deck.gl as a pre-decoded canvas atlas (not data: URLs).

`public/tiles/sacramento.pmtiles` is gitignored. Regenerate it with the [go-pmtiles](https://github.com/protomaps/go-pmtiles) CLI
(pick a recent build date from https://maps.protomaps.com/builds/):

```bash
pmtiles extract https://build.protomaps.com/<YYYYMMDD>.pmtiles apps/desktop/public/tiles/sacramento.pmtiles \
  --bbox=-121.60,38.48,-121.38,38.66 --maxzoom=15
```

The file is checked for the `PMTiles` magic bytes, so a dev server answering a missing file with `index.html` (200) counts as missing, and a MapLibre error on the basemap source shows the same notice.
Without the file the app still works: the map shows a notice and the legend panel lists the pins.
`maplibre-gl` is pinned to 5.24.1 on purpose: deck.gl 9.4 breaks on MapLibre 6.

## CSP (`src-tauri/tauri.conf.json`)

Strict by default; the only additions over the plain app policy:

- `script-src 'self' 'wasm-unsafe-eval'`: SQLite WASM compiles its module at runtime.
  Verified in headless Chromium: without it the canon database cannot be loaded (`script-src wasm-eval`).
- `worker-src 'self' blob:`: MapLibre starts its tile-decoding worker from a blob URL.
  Verified in headless Chromium: without it the worker is blocked (`worker-src blob`).

`img-src data:` was already there (inline SVG). `connect-src` is unchanged (`'self' ipc: http://ipc.localhost`).
