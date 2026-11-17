# Foundation spike (throwaway)

Validates the stack from `docs/design.md` before product code. Results: `docs/spike-report.md`.

## Data (not committed)

```bash
node scripts/make-fixture-db.mjs   # public/fixture.db: synthetic, spoiler-free claims + FTS5 index
pmtiles extract https://build.protomaps.com/<YYYYMMDD>.pmtiles public/tiles/sacramento.pmtiles \
  --bbox=-121.60,38.48,-121.38,38.66 --maxzoom=15   # go-pmtiles CLI
```

## Run

```bash
pnpm install
pnpm tauri build                                     # release build + installers
powershell -File scripts/measure-ram.ps1             # runs the checks, samples RAM of the process tree
```

The app runs three checks on start (SQLite WASM + FTS5, 3D map with deck.gl, Cytoscape graph).
With `SPIKE_REPORT_DIR` set, it writes `checks.json` and base64 screenshots there.
