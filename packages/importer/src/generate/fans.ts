import { createHash } from "node:crypto";
import type { FandomPage } from "../fandom/client.ts";
import { extractLinks, splitSections, stripMarkup } from "../fandom/wikitext.ts";
import type { CharacterRecord } from "../fandom/characters.ts";
import type { EpisodeRecord } from "../fandom/episodes.ts";
import { FINALE, cleanEpisodeTitle, codeOf, compareCodes, maxCode, parseCode, wikiUrl } from "./common.ts";
import type { LinkResolver, PersonRef } from "./links.ts";

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

/** Whole-phrase plain-text signal: a bullet containing `phrase` is gated at `code`. */
export interface Phrase {
  /** Normalized: lowercase words separated by single spaces. */
  phrase: string;
  code: string;
}

/** Titles/names that are ordinary words (or too generic) and would gate unrelated bullets; also skipped below 5 chars. */
export const COMMON_PHRASES: ReadonlySet<string> = new Set([
  "pilot", "redemption", "blood", "bloodshot", "black", "white", "green", "orange", "silver", "golden",
  "father", "mother", "brother", "sister", "family", "friend", "friends", "strange", "murder", "death",
  "agent", "police", "doctor", "captain", "mister", "madame", "stranger", "visitor", "guest", "someone",
]);

const normPhrase = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Episode titles and person names (from their page title / name) with the code at which they become known. */
export function buildPhrases(episodes: EpisodeRecord[], characters: CharacterRecord[], persons: Map<string, PersonRef>): Phrase[] {
  const best = new Map<string, string>();
  const add = (raw: string, code: string): void => {
    const phrase = normPhrase(raw);
    if (phrase.length < 5 || COMMON_PHRASES.has(phrase)) return;
    const cur = best.get(phrase);
    if (cur === undefined || compareCodes(code, cur) > 0) best.set(phrase, code);
  };
  for (const e of episodes) {
    const code = codeOf(e.season, e.episode);
    add(e.title, code);
    add(cleanEpisodeTitle(e.pageTitle), code);
  }
  for (const c of characters) {
    const p = persons.get(c.pageTitle.replace(/_/g, " ").replace(/\s+/g, " ").trim().toLowerCase());
    if (!p) continue;
    add(c.name, p.introduced);
    add(c.pageTitle.replace(/\s*\([^)]*\)\s*$/, ""), p.introduced);
  }
  return [...best].map(([phrase, code]) => ({ phrase, code })).sort((a, b) => (a.phrase < b.phrase ? -1 : 1));
}

const ORDINALS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7 };
const CARDINALS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };

/**
 * Explicit season/episode mentions in free text: `season N episode M`, `episode M of season N`, `SNEM`, `NxM`,
 * then bare `season N` / `Nth season` / `sixth season` (= that season's last episode).
 */
export function explicitMentions(text: string): { episodes: Array<[number, number]>; seasons: number[] } {
  let t = text
    .replace(/\b(first|second|third|fourth|fifth|sixth|seventh)\s+season\b/gi, (_m, w: string) => ` season ${ORDINALS[w.toLowerCase()]} `)
    .replace(/\b(\d+)(?:st|nd|rd|th)\s+season\b/gi, " season $1 ")
    .replace(/\bseason\s+(one|two|three|four|five|six|seven)\b/gi, (_m, w: string) => ` season ${CARDINALS[w.toLowerCase()]} `);
  const eps: Array<[number, number]> = [];
  const take = (re: RegExp, s: number, e: number): void => {
    t = t.replace(re, (...m: unknown[]) => {
      eps.push([Number(m[s]), Number(m[e])]);
      return " ";
    });
  };
  take(/season[^0-9]{0,4}(\d+)[^0-9]{0,4}episode[^0-9]{0,4}(\d+)/gi, 1, 2);
  take(/episode[^0-9]{0,4}(\d+)\s+of\s+(?:the\s+)?season[^0-9]{0,4}(\d+)/gi, 2, 1);
  take(/\bS(\d+)E(\d+)\b/gi, 1, 2);
  take(/\b(\d+)x(\d+)\b/gi, 1, 2);
  const seasons = [...t.matchAll(/\bseason[^0-9]{0,4}(\d+)/gi)].map((m) => Number(m[1]));
  return { episodes: eps, seasons };
}

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
export function generateFans(pages: FanPage[], resolver: LinkResolver, opts: { wikiBase: string; phrases?: Phrase[] }): FansResult {
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
      const mentions = explicitMentions(`${raw}\n${body}`);
      for (const [season, episode] of mentions.episodes) {
        const code = codeOf(season, episode);
        if (parseCode(code) && compareCodes(code, FINALE) <= 0) codes.push(code);
        else unresolved = true;
      }
      for (const season of mentions.seasons) {
        const c = resolver.code(`Season ${season}`);
        if (c === null) unresolved = true;
        else codes.push(c);
      }
      const padded = ` ${normPhrase(body)} `;
      for (const ph of opts.phrases ?? []) if (padded.includes(` ${ph.phrase} `)) codes.push(ph.code);
      if (fp.own === null) stats.noOwnEpisodeItems++;
      else codes.push(fp.own);
      if (unresolved) stats.unresolvedLinkItems++;

      if (fp.kind === "character") {
        if (fp.last) codes.push(fp.last);
        else unresolved = true;
      }
      if (FUTURE_WORDS.test(body)) unresolved = true;

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
