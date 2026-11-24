# Phase 4, slice E: California map and culprits from a secondary source

Feature: show the real places on the map by widening the basemap from Sacramento to California without blowing the RAM budget, and fill in culprits the Wikipedia summaries leave out by citing The Mentalist Wiki (Fandom) as a secondary source. Data stays limited to the owner's progress.

## Specs

- S1: Owner decision (map): "Ampliar el mapa a California (Recomendado)" — "Se baja un mapa más grande (más MB y algo más de RAM) y aparecen los pines reales: Napa, San Francisco, Clarksburg, etc."
- S2: Owner decision (culprits): "Sumar la wiki de fans (Recomendado)" — "The Mentalist Wiki (Fandom) como fuente secundaria, citada en cada dato. El diseño ya permite wikis como fuente secundaria."
- S3: RAM target (foundation L10): "accept ~700 MB with the 3D map open; 3D always available". The California map must not load the whole file into memory: tiles are read by HTTP Range (or an equivalent ranged read).
- S4: `docs/design.md` §1/§3.2: every fact cites a source; primary source is the episode, wikis are secondary. Each wiki-sourced claim cites a wiki source tied to the same episode (`src-wiki-sNeM`, kind `wiki`, `episode` = that episode, `url` = the wiki page).
- S5: Owner progress S6E10: nothing about S6E11 or later; wiki pages contain later spoilers, so only facts the page attributes to that episode are used, and workers never print canon text beyond counts.
- S6: A perpetrator is authored `confirmed` only when the source states the episode reveals who did it; otherwise nothing (or `in_show_suspicion` when the episode presents it as a suspicion).

## Tasks

- T1 [S4] Guard test: a claim's source is `src-<ep>` or `src-wiki-<ep>` of its own reveal episode; wiki sources have kind `wiki`, an https `thementalist.fandom.com` url and their episode. Route: inline. Commit: 0e0b2ff. Done.
- T2 [S2, S4-S6] Culprits (and places the wiki names) for cases without a confirmed perpetrator, one worker per season file `data/canon/cases-sN.yaml`. Route: 6 workers in parallel. Commit: e0429bb (+ audit 8049bf2). Done.
- T3 [S1, S3] California basemap: ranged tile reads in Tauri (custom protocol or equivalent) and in the browser dev server, a California PMTiles extract (gitignored, regeneration documented), camera and bounds that frame California with Sacramento as the default view; RAM measured with the 3D map open. Route: worker (parallel with T2). Commit: 22e75a2 (+ 2985943, 58fbc06). Done: z13 extract 267 MB, 175+ ranged reads all 206, release exe RAM peak 523 MB private (< 700 MB); native review approved (lineage review-bf1631e63ee6216e).

- T4 [L3] App icon: original Red John smiley art (no copied logo), all Tauri icon sizes generated from one source SVG kept in the repo. Route: worker (parallel with T5). Commit: a781188. Done; reopened by L5 → T6.
- T5 [S3] Review follow-ups of 22e75a2: dev-only tiles fallback (`cfg(debug_assertions)`), bounded concurrency for the tiles protocol, build works without the gitignored extract. Route: worker (parallel with T4). Commit: 2985943. Done.
- T6 [L5] Logo = the face Red John paints (homage): app icon, favicon and in-app header logo redrawn as a crude finger-painted blood smiley with drips, original art. Route: worker. Commit: f246d54. Done.
- T7 [S2, S4, S6] Audit all wiki-sourced culprit claims against their pages; remove any not stated by the page as that episode's culprit (L4). Route: worker. Commit: 8049bf2. Done: 71 audited, 5 removed (incl. s3e11 Lima, s3e24 O'Laughlin wiki claim); s3e7 and s1e21 kept after a full read of their pages; 23 of 126 cases still without a confirmed culprit.
- T8 [S1] Map zooms out far enough to frame all of California at 1440x900; tiles protocol tests the verifier proposed. Route: inline. Commit: the "fix(desktop): frame all of California" commit. Done: headless check at 1440x900 shows the whole state and 5 pins; 10 cargo tests.

## Log

- L1: Owner answers (2026-11-24): map "Ampliar el mapa a California (Recomendado)"; culprits "Sumar la wiki de fans (Recomendado)".
- L2: Facts found: Tauri's asset protocol has no HTTP Range (foundation L9), so today the PMTiles file is read fully into memory; a California extract at street zoom would not fit the RAM budget that way. Fandom API answers `api.php?action=parse&prop=wikitext` (HTTP 200).
- L3: Owner request: "a la aplicacion ponle uno icono puede ser la cara sonrinete de redjhon o algo significativo" → T4.
- L4: Independent verification at 2985943: tests, CSP, ranged tiles (175 × 206, 0 external), protocol path checks, build without extract met. Defects: min zoom stops at 6.6 (California not framed); wiki culprits sample seed 20261124: `s3e7-bajoran-perp` likely contradicted, `cl-s1e21-hanson-role` unsupported, `s3e11-lima-perp` uncertain (2-3 of 12) → full audit T7; `s3e24-olaughlin-perp` conflicts with the episode-sourced accomplice role (primary source wins).
- L5: Owner request: "el logo cambialo por la cara que hace redjhon como un homenaje o simbolizmo".
- L6: Final verification at 58fbc06: all met. `s3e7-bajoran-perp` and `cl-s1e21-hanson-role` supported on a full read (L4 heuristic verdicts reversed); fresh sample seed 20261125: 8/8 supported; whole California framed at min zoom 5 with 5 pins in view; 0 errors / 0 CSP violations / 0 external requests. Reference-integrity test added.
