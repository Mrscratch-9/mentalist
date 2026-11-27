import { z } from "zod";
import { ENTITY_KINDS, CLAIM_STATUSES, TRANSLATION_FIELDS } from "@mentalist/core";

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

/** Translations of one language (`data/canon/i18n/<lang>/*.yaml`): keyed by the English item key (T1a). */
export const I18nDoc = z.strictObject({
  translations: z.array(z.strictObject({
    key: str, // claim key, theory key or episode code
    field: z.enum(TRANSLATION_FIELDS),
    hash: z.string().regex(/^[0-9a-f]{12}$/, "12 lowercase hex characters"),
    text: str,
  })).default([]),
});
export type I18nDoc = z.infer<typeof I18nDoc>;
