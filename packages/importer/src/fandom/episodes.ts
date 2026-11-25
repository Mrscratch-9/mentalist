import type { FandomPage } from "./client.ts";
import { extractLinks, findTemplate, stripMarkup } from "./wikitext.ts";

export interface CreditEntry {
  /** Character name or role as written (link label if linked). */
  role: string;
  actor: string;
  characterPage?: string;
  actorPage?: string;
}

export interface EpisodeRecord {
  season: number;
  episode: number;
  title: string;
  /** ISO date (YYYY-MM-DD) when parseable, else null. */
  aired: string | null;
  writer: string;
  director: string;
  guests: CreditEntry[];
  recurring: CreditEntry[];
  pageTitle: string;
  revid: number;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

export function parseAired(text: string): string | null {
  const m = /([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/.exec(stripMarkup(text));
  if (!m) return null;
  const mi = MONTHS.indexOf(m[1]!.toLowerCase());
  if (mi < 0) return null;
  return `${m[3]}-${String(mi + 1).padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
}

/** Parse `Role - [[Actor]]` lines separated by <br>. */
export function parseCredits(raw: string | undefined): CreditEntry[] {
  if (!raw) return [];
  const out: CreditEntry[] = [];
  for (const part of raw.split(/<br\s*\/?>|\n/i)) {
    if (!part.trim()) continue;
    const m = /^(.*?)\s+[-–—]\s+(.+)$/.exec(part.trim());
    const rolePart = m ? m[1]! : part;
    const actorPart = m ? m[2]! : "";
    const role = stripMarkup(rolePart);
    if (!role) continue;
    const entry: CreditEntry = { role, actor: stripMarkup(actorPart) };
    const c = extractLinks(rolePart)[0];
    const a = extractLinks(actorPart)[0];
    if (c) entry.characterPage = c.target;
    if (a) entry.actorPage = a.target;
    out.push(entry);
  }
  return out;
}

function ints(text: string): number[] {
  return [...text.matchAll(/\d+/g)].map((m) => Number(m[0]));
}

/** Resolve season/episode numbers; `[[Season 4|4]]`, `3x23 + 24`, `23-24` and `23 & 24` are handled. */
export function parseNumbers(seasonRaw: string, episodeRaw: string): { season: number; episodes: number[] } | null {
  const season = stripMarkup(seasonRaw);
  const ep = stripMarkup(episodeRaw);
  const sx = /(\d+)\s*x\s*(\d+)(.*)$/i.exec(season) ?? /(\d+)\s*x\s*(\d+)(.*)$/i.exec(ep);
  if (sx) {
    const first = Number(sx[2]);
    const more = ints(sx[3] ?? "");
    return { season: Number(sx[1]), episodes: expand([first, ...more]) };
  }
  const s = ints(season)[0];
  const e = ints(ep);
  if (s === undefined || e.length === 0) return null;
  return { season: s, episodes: expand(e) };
}

function expand(nums: number[]): number[] {
  const first = nums[0]!;
  const last = nums[nums.length - 1]!;
  if (nums.length === 2 && last > first && last - first <= 1) return [first, last];
  return nums.length > 1 && last > first && last - first <= 3 ? Array.from({ length: last - first + 1 }, (_, i) => first + i) : [first];
}

/** Episode records for a page; a double page yields one record per episode, sharing page and revid. */
export function parseEpisodePage(page: FandomPage): EpisodeRecord[] {
  const t = findTemplate(page.wikitext, ["infobox episode"]);
  if (!t) return [];
  const nums = parseNumbers(t.params.season ?? "", t.params.episode ?? "");
  if (!nums) return [];
  const base = {
    title: stripMarkup(t.params.title ?? "") || page.title,
    aired: parseAired(t.params.aired ?? ""),
    writer: stripMarkup(t.params.writer ?? ""),
    director: stripMarkup(t.params.director ?? ""),
    pageTitle: page.title,
    revid: page.revid,
  };
  return nums.episodes.map((episode) => ({
    season: nums.season,
    episode,
    ...base,
    guests: parseCredits(t.params.guests),
    recurring: parseCredits(t.params.recurring),
  }));
}
