# @mentalist/importer

Imports canon from The Mentalist Wiki (Fandom MediaWiki API) and, optionally, TMDB, and writes the YAML the pipeline validates (`data/canon/generated/`).

```
node packages/importer/src/cli.ts [--skip-tmdb] [--offline] [--cache-dir <dir>]
# intended alias: pnpm data:import
```

- Settings come from `data-sources.txt` (gitignored; template `data-sources.example.txt`). Values are never printed.
- `--skip-tmdb`: no TMDB request; episode synopses stay empty and are counted in the report. Without it a `TMDB_API_KEY` is required.
- `--offline`: serve everything from the cache (Fandom and TMDB; no network, no key needed); fails with `offline mode: cache miss` (Fandom) or `offline: TMDB cache missing` (TMDB) otherwise.
- `--cache-dir <dir>`: cache root with `fandom/` and `tmdb/` inside (default `data/.cache`, gitignored).
- Output: `episodes.yaml` (episodes + `src-sNeM`, `src-wiki-sNeM`, `src-tmdb-sNeM` sources), `characters.yaml` (persons + `name`/`actor`/`recurring` claims; never `role`; `actor` only when credited, see Rules), `guests.yaml` (`appears_in` claims), `fans.yaml` (trivia as theories). Deterministic: re-running on the same cache gives identical files.
- The generated set is validated with the pipeline (in a temp dir) before anything is written. Exit 0 ok, 1 validation errors (spoiler-safe `file: path: rule`), 2 usage/environment error. The report prints counts only.

## Rules

- Text: every imported text value (names, actor, trivia bodies and titles, synopses) goes through `plainText` (`src/fandom/wikitext.ts`): templates, `<ref>`, comments, every HTML tag, links, quotes and entities are removed; no `<`, `{{`, `[[`, `''` or `mw-` sequence can remain.
- Names: the person `name` claim is the page title cleaned (no disambiguation like " (character)", no markup). The infobox `name`, alias, real name and `job` hold the character's FINAL values and are never emitted (the infobox name is kept only as a gating alias for fan text). `role` is never imported; dated roles are curated in `data/canon/core.yaml`.
- Actor: the infobox `actor` is the FINAL actor and can reveal a mystery identity, so it is emitted only when the episode infobox Guests/Recurring credits list that actor for the character (matched by character page after redirects, else by role name), from the first credited episode at or after the introduction (claim `revealed`/`source` = that episode). Never credited: no `actor` claim. Exception: a `Main characters` page introduced in S1E1 (pilot cast) keeps the actor at the introduction, except the mystery identities in `MYSTERY_IDENTITIES` (`src/generate/characters.ts`). The report counts claims kept at introduction, moved later and dropped.
- Persons are created only for character pages with an infobox whose `first` resolves to an episode; `status` and `family` are never imported, and `last` is read only to gate fan trivia (never emitted as a claim or text).
- Every claim is revealed at the person's first episode (or, for `appears_in`, at that episode) and sourced to that episode's wiki source; the character page URL + revision is in the claim `note`.
- Trivia bullet `spoils_up_to` = latest of the page's own episode, every linked episode/character introduction and explicit text mentions; any unresolvable link gates the bullet at the series finale (`S7E13`). Explicit mentions: `season N episode M` (up to 4 non-digits between), `episode M of season N`, `SNEM`, `NxM`, and bare `season N` / `Nth season` / `sixth season` (= the last episode of season N; beyond S7 = finale). Plain text can describe later events, so more rules apply:
  - Plain-text episode titles (whole phrase, case-insensitive) gate at that episode; character names/page titles gate at the character's `introduced`. Phrases under 5 characters and the `COMMON_PHRASES` list in `src/generate/fans.ts` are ignored.
  - Character pages: also the character's infobox `last` episode; a missing or unresolvable `last` gates at the finale.
  - Future-knowledge words (heuristic, every page kind): a bullet whose text contains a future-knowledge word (`later`, `eventually`, `would`, `final`, `last episode`, `dies`, `killed`, `revealed`, `turns out`, `season 7`, `series finale`; whole words, case-insensitive) gates at the finale. It errs on the side of hiding; a recurring character mentioned by name does not by itself raise the gate.
- Fandom text is CC BY-SA; TMDB data needs the attribution described in `odd/tasks/source-importer.md` (S9).

## Second language (episode title / synopsis)

With TMDB enabled the importer also fetches `TMDB_LANGUAGE_SECONDARY` (default `es-MX`, in `data-sources.txt`) for every season and writes `data/canon/i18n/<lang>/episodes.yaml` (`es` for `es-MX`): one entry per non-empty English `title` / `synopsis` that has a non-empty secondary text, `key` = episode code, `hash` = `textHash` (pipeline) of the English text exactly as written to `generated/episodes.yaml`, `text` through `plainText`. Re-running after an English change refreshes the hashes together with the English file. The file is validated with the pipeline (together with the generated set) before anything is written. Same base language as `TMDB_LANGUAGE`: nothing is fetched. `--offline` without a cached secondary language: skipped (the report says so) and the existing file is left alone. `--skip-tmdb`: skipped. Other i18n files (curated translations) are never touched by the importer.
