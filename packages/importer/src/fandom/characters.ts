import type { FandomPage } from "./client.ts";
import { extractLinks, findTemplate, plainText } from "./wikitext.ts";

/**
 * Deliberately omits status/family/job and the infobox name: the infobox holds the character's FINAL values (later
 * surnames, real identities, last jobs), which would leak later seasons at the first appearance. `lastEpisode` is for spoiler gating only; never emit it. */
export interface CharacterRecord {
  pageTitle: string;
  /** The page title cleaned (no disambiguation, no markup): the only name ever imported. */
  name: string;
  actor: string | null;
  /** Infobox name (final value, may be a later surname or real identity). For spoiler gating of fan text ONLY; never emit it. */
  gatingAlias: string | null;
  /** Title of the episode page of first appearance. */
  first: string | null;
  /** Title of the episode page of last appearance (infobox `last`); gating only. */
  lastEpisode: string | null;
  categories: string[];
  revid: number;
}

const orNull = (s: string | undefined): string | null => {
  const v = plainText(s ?? "");
  return v ? v : null;
};

/** Page title without a trailing disambiguation like " (character)" and without markup. */
export function personName(pageTitle: string): string {
  return plainText(pageTitle).replace(/\s*\([^()]*\)\s*$/, "").trim() || plainText(pageTitle);
}

export function parseCharacterPage(page: FandomPage): CharacterRecord | null {
  const t = findTemplate(page.wikitext, ["infobox character"]);
  if (!t) return null;
  const firstRaw = t.params.first ?? "";
  const lastRaw = t.params.last ?? "";
  return {
    pageTitle: page.title,
    name: personName(page.title),
    actor: orNull(t.params.actor),
    gatingAlias: orNull(t.params.name),
    first: extractLinks(firstRaw)[0]?.target ?? orNull(firstRaw),
    lastEpisode: extractLinks(lastRaw)[0]?.target ?? orNull(lastRaw),
    categories: [...page.categories],
    revid: page.revid,
  };
}
