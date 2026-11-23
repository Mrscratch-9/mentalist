import { z } from "zod";
import { ENTITY_KINDS, CLAIM_STATUSES } from "@mentalist/core";

const str = z.string().min(1);

export const Doc = z.strictObject({
  episodes: z.array(z.strictObject({
    code: str, title: str, synopsis: z.string().default(""), details: z.string().default(""),
  })).default([]),
  sources: z.array(z.strictObject({
    key: str, kind: z.enum(["episode", "wiki", "other"]),
    episode: str.optional(), url: str.optional(), scene: str.optional(),
  })).default([]),
  entities: z.array(z.strictObject({
    key: str, kind: z.enum(ENTITY_KINDS), introduced: str,
  })).default([]),
  claims: z.array(z.strictObject({
    key: str, subject: str, predicate: str,
    object: str.optional(), value: z.string().optional(),
    revealed: str,
    superseded: z.strictObject({ in: str, by: str }).optional(),
    status: z.enum(CLAIM_STATUSES).default("confirmed"),
    source: str.optional(), // required by the validator (claim.source_missing) so it is reported with the other rules
    note: z.string().default(""),
  })).default([]),
  arcs: z.array(z.strictObject({
    arc: str,
    items: z.array(z.strictObject({
      order: z.number().int(), claim: str.optional(), entity: str.optional(),
      text: str, revealed: str,
    }).refine((i) => (i.claim === undefined) !== (i.entity === undefined), {
      message: "exactly one of claim / entity",
    })).default([]),
  })).default([]),
  theories: z.array(z.strictObject({
    key: str, title: str, body: str, url: str, author: str.optional(),
    spoils_up_to: str.optional(), tags: z.array(z.string()).default([]),
  })).default([]),
});
export type Doc = z.infer<typeof Doc>;
