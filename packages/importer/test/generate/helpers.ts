import type { FandomPage } from "../../src/fandom/client.ts";
import type { EpisodeRecord } from "../../src/fandom/episodes.ts";
import type { CharacterRecord } from "../../src/fandom/characters.ts";

export const BASE = "https://wiki.example.test/wiki/";

export const ep = (season: number, episode: number, pageTitle: string, revid = 100 + episode, extra: Partial<EpisodeRecord> = {}): EpisodeRecord => ({
  season, episode, title: `${pageTitle} Episode`, aired: null, writer: "", director: "",
  guests: [], recurring: [], pageTitle, revid, ...extra,
});

export const ch = (pageTitle: string, extra: Partial<CharacterRecord> = {}): CharacterRecord => ({
  pageTitle, name: pageTitle, actor: null, gatingAlias: null, first: "Pilot", lastEpisode: null, categories: [], revid: 7, ...extra,
});

export const page = (title: string, wikitext: string, revid = 9): FandomPage => ({
  title, pageid: 1, revid, wikitext, categories: [],
});

export const S1 = [ep(1, 1, "Pilot"), ep(1, 2, "Second One"), ep(1, 3, "Third (episode)")];
