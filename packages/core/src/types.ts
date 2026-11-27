/** Domain types (design §3). IDs are opaque strings: never parse or construct meaning from them. */

type Brand<T extends string> = string & { readonly __brand: T };
export type EntityId = Brand<"Entity">;
export type ClaimId = Brand<"Claim">;
export type TheoryId = Brand<"Theory">;

export const entityId = (s: string): EntityId => s as EntityId;
export const claimId = (s: string): ClaimId => s as ClaimId;
export const theoryId = (s: string): TheoryId => s as TheoryId;

export const ENTITY_KINDS = [
  "person", "organization", "location", "case", "episode", "evidence", "event", "arc",
] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export const CLAIM_STATUSES = ["confirmed", "in_show_suspicion"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const CASE_ROLES = [
  "victim", "suspect", "perpetrator", "investigator", "witness", "accomplice", "informant",
] as const;
export type CaseRole = (typeof CASE_ROLES)[number];

/** Entity: identity only. Names, aliases, coordinates, relations are claims. */
export interface Entity {
  id: EntityId;
  kind: EntityKind;
  introducedIn: number;
}

/** A dated assertion. Exactly one of `object` / `value` is normally set. */
export interface Claim {
  id: ClaimId;
  subject: EntityId;
  predicate: string;
  object: EntityId | null;
  value: string | null;
  revealedIn: number;
  supersededIn: number | null;
  supersededBy: ClaimId | null;
  status: ClaimStatus;
  sourceId: string;
  note: string;
}

export interface Episode {
  /** Global index 1..N from the first episode to the finale. */
  epIndex: number;
  season: number;
  number: number;
  title: string;
  synopsis: string;
  /** Gated: only exposed once the episode is watched. */
  details: string;
}

/** `role_in_case(person, case, role)` is stored as a claim with this predicate. */
export const ROLE_IN_CASE = "role_in_case";
/** Coordinates are claims: predicate `coordinates`, value `"lat,lon"`. */
export const COORDINATES = "coordinates";

export interface ArcItem {
  arc: EntityId;
  order: number;
  refClaim: ClaimId | null;
  refEntity: EntityId | null;
  narrativeText: string;
  revealedIn: number;
}

/** Non-canon fan theory. */
export interface Theory {
  id: TheoryId;
  title: string;
  body: string;
  sourceUrl: string;
  authorHandle: string | null;
  spoilsUpTo: number;
  tags: string[];
}

/** Text fields that can carry a translation, per target: claim value|note, theory title|body, episode title|synopsis. */
export const TRANSLATION_FIELDS = ["value", "note", "title", "body", "synopsis"] as const;
export type TranslationField = (typeof TRANSLATION_FIELDS)[number];

/**
 * Predicates whose `value` is read by code (not shown as prose); their values are never translated:
 * role enum, "lat,lon", and the "true" flags the app keys on.
 */
export const NON_TEXT_PREDICATES: readonly string[] = [ROLE_IN_CASE, COORDINATES, "recurring", "team_base", "red_john_smiley"];

/** The language every canon text is authored in; the fallback of every translated field. */
export const BASE_LANG = "en";

/**
 * A translation of one text field. `targetId` is the opaque claim / theory id, or, for episodes
 * (which have no opaque id), `episodeTargetId(epIndex)`. `lang` is a lowercase base language ("es").
 */
export interface Translation {
  targetId: string;
  field: TranslationField;
  lang: string;
  text: string;
}

export const episodeTargetId = (epIndex: number): string => String(epIndex);

/** Everything needed to populate a database (used by the data pipeline and tests). */
export interface Dataset {
  episodes: Episode[];
  entities: Entity[];
  claims: Claim[];
  arcItems: ArcItem[];
  theories: Theory[];
  /** Optional: absent = no translations (English only). */
  translations?: Translation[];
}
