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

/** Everything needed to populate a database (used by the data pipeline and tests). */
export interface Dataset {
  episodes: Episode[];
  entities: Entity[];
  claims: Claim[];
  arcItems: ArcItem[];
  theories: Theory[];
}
