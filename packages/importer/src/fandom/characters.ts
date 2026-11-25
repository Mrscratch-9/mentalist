import type { FandomPage } from "./client.ts";
import { extractLinks, findTemplate, stripMarkup } from "./wikitext.ts";

/** Deliberately omits status/last/family: they reveal later canon. */
export interface CharacterRecord {
  pageTitle: string;
  name: string;
  actor: string | null;
  /** Title of the episode page of first appearance. */
  first: string | null;
  job: string | null;
  categories: string[];
  revid: number;
}

const orNull = (s: string | undefined): string | null => {
  const v = stripMarkup(s ?? "");
  return v ? v : null;
};

export function parseCharacterPage(page: FandomPage): CharacterRecord | null {
  const t = findTemplate(page.wikitext, ["infobox character"]);
  if (!t) return null;
  const firstRaw = t.params.first ?? "";
  return {
    pageTitle: page.title,
    name: orNull(t.params.name) ?? page.title,
    actor: orNull(t.params.actor),
    first: extractLinks(firstRaw)[0]?.target ?? orNull(firstRaw),
    job: orNull(t.params.job),
    categories: [...page.categories],
    revid: page.revid,
  };
}
