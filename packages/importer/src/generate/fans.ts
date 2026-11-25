import { createHash } from "node:crypto";
import type { FandomPage } from "../fandom/client.ts";
import { extractLinks, splitSections, stripMarkup } from "../fandom/wikitext.ts";
import { FINALE, compareCodes, maxCode, parseCode, wikiUrl } from "./common.ts";
import type { LinkResolver } from "./links.ts";

export interface FanPage {
  page: FandomPage;
  kind: "episode" | "character";
  /** Code of the page's own episode (episode page) or of the character's `first`; null when unknown. */
  own: string | null;
  /** Character pages: code of the character's last appearance (gating only); null/absent = unknown, gates at the finale. */
  last?: string | null;
}

/** Plain-text signals that an episode-page bullet talks about later events. */
export const FUTURE_WORDS =
  /\b(?:later|eventually|would|final|last episode|dies|killed|revealed|turns out|season 7|series finale)\b/i;

export interface OutTheory {
  key: string;
  title: string;
  body: string;
  url: string;
  author: string;
  spoils_up_to: string;
  tags: string[];
}

export interface FansResult {
  theories: OutTheory[];
  stats: {
    items: number;
    unresolvedLinkItems: number;
    noOwnEpisodeItems: number;
    bySeason: Record<number, number>;
  };
}

const TITLE_WORDS = 8;

/** Trivia section text, including its sub-sections. */
export function triviaText(wikitext: string): string {
  const sections = splitSections(wikitext);
  const out: string[] = [];
  let level = 0;
  for (const s of sections) {
    if (level > 0 && s.level > level) out.push(s.text);
    else if (/^trivia$/i.test(s.heading)) {
      level = s.level;
      out.push(s.text);
    } else level = 0;
  }
  return out.join("\n");
}

/** One group per top-level bullet; nested bullets and continuation lines stay with their parent. */
function bulletGroups(text: string): string[] {
  const groups: string[][] = [];
  let cur: string[] | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "") {
      cur = null;
    } else if (/^\*(?!\*)/.test(line)) {
      cur = [line.replace(/^\*+\s*/, "")];
      groups.push(cur);
    } else if (cur) {
      cur.push(line.replace(/^[*:#]+\s*/, ""));
    }
  }
  return groups.map((g) => g.join(" "));
}

const ENTITIES: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&quot;": '"', "&#39;": "'", "&lt;": "<", "&gt;": ">" };

/** Plain text of a bullet: refs, templates, tags and link markup removed. */
export function cleanBody(raw: string): string {
  let s = raw.replace(/<ref\b[^>]*\/>/gi, "").replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, "");
  for (let prev = ""; prev !== s; ) {
    prev = s;
    s = s.replace(/\{\{[^{}]*\}\}/g, "");
  }
  s = s.replace(/\[(?:https?:)?\/\/\S+\s+([^\]]+)\]/g, "$1").replace(/\[(?:https?:)?\/\/\S+\]/g, "");
  s = stripMarkup(s).replace(/<[^>]+>/g, "");
  s = s.replace(/&(?:nbsp|amp|quot|lt|gt|#39);/g, (m) => ENTITIES[m] ?? m);
  return s.replace(/\s+/g, " ").trim();
}

function makeTitle(body: string): string {
  const words = body.split(" ");
  return words.length <= TITLE_WORDS ? body : `${words.slice(0, TITLE_WORDS).join(" ")}…`;
}

/** Trivia bullets as non-canon theories, gated to the latest episode they can reveal. */
export function generateFans(pages: FanPage[], resolver: LinkResolver, opts: { wikiBase: string }): FansResult {
  const byKey = new Map<string, OutTheory>();
  const stats = { items: 0, unresolvedLinkItems: 0, noOwnEpisodeItems: 0, bySeason: {} as Record<number, number> };

  for (const fp of pages) {
    for (const raw of bulletGroups(triviaText(fp.page.wikitext))) {
      const body = cleanBody(raw);
      if (body === "") continue;

      const codes: string[] = [];
      let unresolved = false;
      for (const l of extractLinks(raw)) {
        const c = resolver.code(l.target);
        if (c === null) unresolved = true;
        else codes.push(c);
      }
      for (const m of raw.matchAll(/\bS(\d+)E(\d+)\b|\b(\d+)x(\d+)\b/gi)) {
        const code = `S${m[1] ?? m[3]}E${m[2] ?? m[4]}`;
        if (parseCode(code) && compareCodes(code, FINALE) <= 0) codes.push(code);
        else unresolved = true;
      }
      for (const m of raw.matchAll(/\bseason\s+(\d+)\b/gi)) {
        const c = resolver.code(`Season ${m[1]}`);
        if (c === null) unresolved = true;
        else codes.push(c);
      }
      if (fp.own === null) stats.noOwnEpisodeItems++;
      else codes.push(fp.own);
      if (unresolved) stats.unresolvedLinkItems++;

      if (fp.kind === "character") {
        if (fp.last) codes.push(fp.last);
        else unresolved = true;
      } else if (FUTURE_WORDS.test(body)) unresolved = true;

      const spoils = unresolved || fp.own === null ? FINALE : (maxCode(codes) ?? FINALE);
      const key = `t-${createHash("sha256").update(`${fp.page.title}\n${body}`).digest("hex").slice(0, 12)}`;
      if (byKey.has(key)) continue;
      byKey.set(key, {
        key,
        title: makeTitle(body),
        body,
        url: wikiUrl(opts.wikiBase, fp.page.title, fp.page.revid),
        author: "Fandom contributors",
        spoils_up_to: spoils,
        tags: ["trivia"],
      });
    }
  }
  const theories = [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  for (const t of theories) {
    const season = parseCode(t.spoils_up_to)!.season;
    stats.bySeason[season] = (stats.bySeason[season] ?? 0) + 1;
  }
  stats.items = theories.length;
  return { theories, stats };
}
