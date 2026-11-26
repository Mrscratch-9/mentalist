import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCharacterPage } from "../../src/fandom/characters.ts";
import { parseEpisodePage } from "../../src/fandom/episodes.ts";
import type { FandomPage } from "../../src/fandom/client.ts";

const pilot = readFileSync(new URL("./fixtures/pilot-infobox.wiki", import.meta.url), "utf8");
const page = (title: string, wikitext: string, categories: string[] = []): FandomPage => ({
  title, pageid: 1, revid: 42, wikitext, categories,
});

describe("parseEpisodePage", () => {
  it("parses the pilot", () => {
    const [e, ...rest] = parseEpisodePage(page("Pilot", pilot));
    expect(rest).toEqual([]);
    expect(e).toMatchObject({
      season: 1, episode: 1, title: "Pilot Episode", aired: "2008-09-23",
      writer: "Bruno Heller", director: "David Nutter", pageTitle: "Pilot", revid: 42,
    });
    expect(e?.recurring).toEqual([
      { role: "Brett Partridge", actor: "Jack Plotnick", characterPage: "Brett Partridge", actorPage: "Jack Plotnick" },
      { role: "Dr. Linus Wagner", actor: "Zeljko Ivanek", characterPage: "Linus Wagner", actorPage: "Zeljko Ivanek" },
    ]);
    expect(e?.guests).toHaveLength(4);
    expect(e?.guests[2]).toEqual({ role: "Medical Examiner", actor: "Tara Karsian", actorPage: "Tara Karsian" });
  });
  it("normalizes [[Season 4|4]]", () => {
    const [e] = parseEpisodePage(page("X", "{{Infobox episode|Title=X|season=[[Season 4|4]]|episode=2|Aired=Synthetic}}"));
    expect([e?.season, e?.episode, e?.aired]).toEqual([4, 2, null]);
  });
  it("splits the double page into two records sharing the page", () => {
    const r = parseEpisodePage(page("Dbl", "{{Infobox episode|Title=D|season=3|episode=23 + 24}}"));
    expect(r.map((x) => [x.season, x.episode, x.pageTitle, x.revid])).toEqual([[3, 23, "Dbl", 42], [3, 24, "Dbl", 42]]);
    const r2 = parseEpisodePage(page("Dbl2", "{{Infobox episode|Title=D|season=3x23 + 24}}"));
    expect(r2.map((x) => [x.season, x.episode])).toEqual([[3, 23], [3, 24]]);
  });
  it("returns [] without infobox or numbers", () => {
    expect(parseEpisodePage(page("N", "text"))).toEqual([]);
    expect(parseEpisodePage(page("N", "{{Infobox episode|Title=D}}"))).toEqual([]);
  });
});

describe("parseCharacterPage", () => {
  const src = "{{Infobox character|name=Final Name|actor=[[Some Actor]]|first=[[Pilot]]|last=[[Secret]]|status=Deceased|job=<small>Agent</small>|family=[[Kin]]}}";
  it("returns only the safe fields; name is the cleaned page title, never the infobox name or job", () => {
    const c = parseCharacterPage(page("Synth Person (character)", src, ["Main characters"]));
    expect(c).toEqual({
      pageTitle: "Synth Person (character)", name: "Synth Person", actor: "Some Actor", gatingAlias: "Final Name", first: "Pilot",
      lastEpisode: "Secret", categories: ["Main characters"], revid: 42,
    });
    expect(Object.keys(c!)).not.toContain("job");
    expect(Object.keys(c!)).not.toContain("status");
    expect(Object.keys(c!)).not.toContain("last");
    expect(parseCharacterPage(page("N", "{{Infobox character|name=Z|first=[[Pilot]]}}"))!.lastEpisode).toBeNull();
    expect(Object.keys(c!)).not.toContain("family");
  });
  it("returns null without infobox and nulls for missing fields", () => {
    expect(parseCharacterPage(page("N", "x"))).toBeNull();
    expect(parseCharacterPage(page("N", "{{Infobox_character|name=Z}}"))).toMatchObject({ name: "N", actor: null, first: null });
  });
});
