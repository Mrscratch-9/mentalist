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
