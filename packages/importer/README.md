# @mentalist/importer

Imports canon from The Mentalist Wiki (Fandom MediaWiki API) and, optionally, TMDB, and writes the YAML the pipeline validates (`data/canon/generated/`).

```
node packages/importer/src/cli.ts [--skip-tmdb] [--offline] [--cache-dir <dir>]
# intended alias: pnpm data:import
```

- Settings come from `data-sources.txt` (gitignored; template `data-sources.example.txt`). Values are never printed.
- `--skip-tmdb`: no TMDB request; episode synopses stay empty and are counted in the report. Without it a `TMDB_API_KEY` is required.
- `--offline`: serve everything from the cache (no network); fails with `offline mode: cache miss` otherwise.
- `--cache-dir <dir>`: cache root with `fandom/` and `tmdb/` inside (default `data/.cache`, gitignored).
- Output: `episodes.yaml` (episodes + `src-sNeM`, `src-wiki-sNeM`, `src-tmdb-sNeM` sources), `characters.yaml` (persons + `name`/`actor`/`role`/`recurring` claims), `guests.yaml` (`appears_in` claims), `fans.yaml` (trivia as theories). Deterministic: re-running on the same cache gives identical files.
- The generated set is validated with the pipeline (in a temp dir) before anything is written. Exit 0 ok, 1 validation errors (spoiler-safe `file: path: rule`), 2 usage/environment error. The report prints counts only.

## Rules

- Persons are created only for character pages with an infobox whose `first` resolves to an episode; `status` and `family` are never imported, and `last` is read only to gate fan trivia (never emitted as a claim or text).
- Every claim is revealed at the person's first episode (or, for `appears_in`, at that episode) and sourced to that episode's wiki source; the character page URL + revision is in the claim `note`.
- Trivia bullet `spoils_up_to` = latest of the page's own episode, every linked episode/character introduction and `S#E#`/`NxM`/`Season N` text mentions; any unresolvable link gates the bullet at the series finale (`S7E13`). Plain text can describe later events, so two more rules apply:
  - Character pages: also the character's infobox `last` episode; a missing or unresolvable `last` gates at the finale.
  - Episode pages (heuristic): a bullet whose text contains a future-knowledge word (`later`, `eventually`, `would`, `final`, `last episode`, `dies`, `killed`, `revealed`, `turns out`, `season 7`, `series finale`; whole words, case-insensitive) gates at the finale. It errs on the side of hiding; a recurring character mentioned by name does not by itself raise the gate.
- Fandom text is CC BY-SA; TMDB data needs the attribution described in `odd/tasks/source-importer.md` (S9).
