/** Table layer. Internal: never exported from index.ts (UI must not touch tables). */
import { CLAIM_STATUSES, ENTITY_KINDS, TRANSLATION_FIELDS } from "./types.ts";

const list = (xs: readonly string[]) => xs.map((x) => `'${x}'`).join(",");

export const SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE episode (
    ep_index INTEGER PRIMARY KEY,
    season INTEGER NOT NULL,
    number INTEGER NOT NULL,
    title TEXT NOT NULL,
    synopsis TEXT NOT NULL,
    details TEXT NOT NULL,
    UNIQUE (season, number)
  )`,
  `CREATE TABLE entity (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN (${list(ENTITY_KINDS)})),
    introduced_in INTEGER NOT NULL
  )`,
  `CREATE TABLE claim (
    id TEXT PRIMARY KEY,
    subject TEXT NOT NULL REFERENCES entity(id),
    predicate TEXT NOT NULL,
    object_id TEXT REFERENCES entity(id),
    value TEXT,
    revealed_in INTEGER NOT NULL,
    superseded_in INTEGER,
    superseded_by TEXT,
    status TEXT NOT NULL CHECK (status IN (${list(CLAIM_STATUSES)})),
    source_id TEXT NOT NULL CHECK (source_id <> ''),
    note TEXT NOT NULL
  )`,
  `CREATE INDEX claim_subject ON claim(subject)`,
  `CREATE VIRTUAL TABLE claim_fts USING fts5(claim_id UNINDEXED, body, tokenize = 'unicode61')`,
  `CREATE TABLE arc_item (
    arc_id TEXT NOT NULL REFERENCES entity(id),
    ord INTEGER NOT NULL,
    ref_claim_id TEXT REFERENCES claim(id),
    ref_entity_id TEXT REFERENCES entity(id),
    narrative_text TEXT NOT NULL,
    revealed_in INTEGER NOT NULL
  )`,
  `CREATE TABLE theory (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    source_url TEXT NOT NULL,
    author_handle TEXT,
    spoils_up_to INTEGER NOT NULL,
    tags TEXT NOT NULL
  )`,
  `CREATE TABLE translation (
    target_id TEXT NOT NULL,
    field TEXT NOT NULL CHECK (field IN (${list(TRANSLATION_FIELDS)})),
    lang TEXT NOT NULL,
    text TEXT NOT NULL,
    PRIMARY KEY (target_id, field, lang)
  )`,
  `CREATE VIRTUAL TABLE translation_fts USING fts5(claim_id UNINDEXED, lang UNINDEXED, body, tokenize = 'unicode61')`,
];
