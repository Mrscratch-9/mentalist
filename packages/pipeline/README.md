# @mentalist/pipeline

YAML canon files → validator → compiled read-only SQLite (design §5).

## Usage

```
pnpm data:build <in-dir> <out.sqlite> [--force] [--verbose]
# or: node src/cli.ts <in-dir> <out.sqlite> [--force] [--verbose]
```

- Reads every `*.yaml` / `*.yml` under `<in-dir>`, recursively (sorted by relative path, forward slashes, e.g. `generated/episodes.yaml`), and merges them. Each key must be defined once across all files. Episode order = order of appearance.
- Exit 0: one-line summary of counts. Exit 1: validation errors on stderr (canon problems only), nothing written. Exit 2: usage or environment error (bad args, unreadable/empty input dir, an input file that cannot be read (`input file not readable: <file>`), output exists without `--force`, I/O failure such as a missing or unwritable output directory; one line `build failed: <code>`, no stack trace). The Usage line is printed only for real argument errors.
- Errors are spoiler-safe: `file: path: rule` (e.g. `canon.yaml: claims[12].revealed: ref.unresolved`). `--verbose` appends the offending key/value.
- Output is written to a temp file and renamed; an existing output is never touched without `--force`.

## Authoring format

Top-level keys (all optional lists; unknown fields are rejected):

- `episodes`: `code` (`S1E3`), `title`, `synopsis`, `details`.
- `sources`: `key`, `kind` (`episode|wiki|other`), `episode` (code; required for `episode`), `url`, `scene`.
- `entities`: `key`, `kind`, `introduced` (episode code).
- `claims`: `key`, `subject` (entity key), `predicate`, one of `object` (entity key) / `value`, `revealed` (code), `superseded: { in: code, by: claim key }`, `status` (default `confirmed`), `source` (source key, required), `note`. `role_in_case` takes both `object` (a `case` entity) and `value` (a case role); `coordinates` takes `value: "lat,lon"`.
- `arcs`: `arc` (entity key of kind `arc`), `items`: `order`, one of `claim` / `entity`, `text`, `revealed`.
- `theories`: `key`, `title`, `body`, `url`, `author`, `spoils_up_to` (code; omitted = 0), `tags`.

IDs in the database are opaque: prefix + 12 hex chars of SHA-256 of a namespaced author key.
Source metadata (`kind`, `url`, `scene`) is validated but only the opaque `source_id` is stored (core has no source table).

## Rules (error codes)

`schema`, `yaml.parse`, `key.duplicate`, `ref.unresolved`, `episode.code_malformed`, `episode.code_duplicate`, `source.episode_required`, `claim.revealed_before_subject`, `claim.revealed_before_object`, `claim.superseded_not_after_reveal`, `claim.source_missing`, `claim.supersede_cycle`, `claim.object_value`, `claim.role_invalid`, `claim.role_object_not_case`, `claim.coordinates_invalid`, `arc.not_arc_entity`, `arc.item_before_ref`, `arc.duplicate` (same arc in more than one `arcs` block), `arc.order_duplicate` (repeated `order` within an arc).

## Translations (`data/canon/i18n/<lang>/**.yaml`)

Spanish (and any other language) lives beside the canon, never inside it. The loader reads every yaml under `i18n/<lang>/` (`<lang>` = lowercase 2-3 letter code, not `en`; otherwise `i18n.lang_invalid`) as a translation file instead of canon:

```yaml
translations:
  - key: c-p-some-claim      # the ENGLISH item key: claim key, theory key, or episode code (S1E3)
    field: value             # value | note (claims), title | body (theories), title | synopsis (episodes)
    hash: 0123456789ab       # first 12 hex of sha256 of the English source text, exactly as authored (textHash)
    text: Texto en español
```

- Validation (errors, exit 1, spoiler-safe `file: path: rule`): `i18n.key_unresolved` (no such claim/theory/episode), `i18n.field_invalid` (the field does not exist or is empty on it; `value` of `role_in_case`, `coordinates`, `recurring`, `team_base`, `red_john_smiley` is code-read and not translatable), `i18n.key_ambiguous` (`title` where an episode code and a theory key coincide), `i18n.duplicate` (same language, key and field twice, also across files), `i18n.lang_invalid`, plus `schema` (strict fields, 12-hex hash, non-empty text).
- Stale: when `hash` differs from the hash of the current English text the entry is NOT compiled (the app falls back to English) and is counted and reported as a warning, never an error: `warning: i18n/es/x.yaml: translations[3]: i18n.stale (es <key> <field>)` on stderr (keys only, no text), and `, N stale (not compiled)` in the summary line. Exit stays 0. Fix by re-translating and updating the `hash`.
- Compiled into the `translation(target_id, field, lang, text)` table with the same opaque ids as the English rows (episodes: the `ep_index`). The summary line reports `N translations`. An empty or missing `i18n/` is fine.
- API: `loadDir` returns `{ docs, i18n, errors }`; `validate(docs, i18n?)`; `compile(docs, i18n?)`; `resolveI18n(docs, i18n)` -> `{ translations, stale }`; `textHash(text)`; `buildDatabase` returns `{ errors, warnings, dataset? }` (`formatWarning` to print).
