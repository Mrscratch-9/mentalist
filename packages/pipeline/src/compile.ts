import { createHash } from "node:crypto";
import { claimId, entityId, theoryId, type Dataset } from "@mentalist/core";
import { resolveI18n } from "./i18n.ts";
import type { LoadedDoc, LoadedI18n } from "./load.ts";
import { CODE_RE, collect, episodeIndex } from "./validate.ts";

/** Opaque, deterministic, non-sequential id: prefix + truncated SHA-256 of a namespaced author key (S3). */
export const opaque = (ns: "e" | "c" | "s" | "t", authorKey: string): string =>
  `${ns}_${createHash("sha256").update(`mentalist:${ns}:${authorKey}`).digest("hex").slice(0, 12)}`;

/**
 * Compile validated docs into a Dataset. Call only when `validate` returned no errors.
 * Translations (`i18n`) whose hash no longer matches the English text are left out (see `resolveI18n`).
 */
export function compile(docs: LoadedDoc[], i18n: LoadedI18n[] = []): Dataset {
  const eps = episodeIndex(docs);
  const ep = (code: string) => eps.get(code)!;
  return {
    episodes: collect(docs, "episodes").map(({ r }, i) => {
      const m = CODE_RE.exec(r.code)!;
      return { epIndex: i + 1, season: Number(m[1]), number: Number(m[2]), title: r.title, synopsis: r.synopsis, details: r.details };
    }),
    entities: collect(docs, "entities").map(({ r }) => ({
      id: entityId(opaque("e", r.key)), kind: r.kind, introducedIn: ep(r.introduced),
    })),
    claims: collect(docs, "claims").map(({ r }) => ({
      id: claimId(opaque("c", r.key)),
      subject: entityId(opaque("e", r.subject)),
      predicate: r.predicate,
      object: r.object === undefined ? null : entityId(opaque("e", r.object)),
      value: r.value ?? null,
      revealedIn: ep(r.revealed),
      supersededIn: r.superseded ? ep(r.superseded.in) : null,
      supersededBy: r.superseded ? claimId(opaque("c", r.superseded.by)) : null,
      status: r.status,
      sourceId: opaque("s", r.source!),
      note: r.note,
    })),
    arcItems: collect(docs, "arcs").flatMap(({ r: a }) => a.items.map((it) => ({
      arc: entityId(opaque("e", a.arc)),
      order: it.order,
      refClaim: it.claim === undefined ? null : claimId(opaque("c", it.claim)),
      refEntity: it.entity === undefined ? null : entityId(opaque("e", it.entity)),
      narrativeText: it.text,
      revealedIn: ep(it.revealed),
    }))),
    theories: collect(docs, "theories").map(({ r }) => ({
      id: theoryId(opaque("t", r.key)), title: r.title, body: r.body, sourceUrl: r.url,
      authorHandle: r.author ?? null, spoilsUpTo: r.spoils_up_to === undefined ? 0 : ep(r.spoils_up_to), tags: r.tags,
    })),
    translations: resolveI18n(docs, i18n).translations,
  };
}
