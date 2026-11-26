import { describe, expect, it } from "vitest";
import { buildPhrases, generateFans } from "../../src/generate/fans.ts";
import { createLinkResolver } from "../../src/generate/links.ts";
import { BASE, ch, ep, page } from "./helpers.ts";

const eps = [ep(1, 1, "Pilot"), ep(1, 2, "Two"), ep(2, 5, "Fifth")];
const persons = new Map([["early person", { key: "p-early-person", introduced: "S1E2" }]]);
const resolver = createLinkResolver({ episodes: eps, persons });
const wiki = (body: string) => `Intro\n==Trivia==\n${body}\n==Gallery==\n* not trivia [[Fifth]]`;

describe("generateFans markup", () => {
  it("leaves no tag, template, link, quote or mw- sequence in bodies and titles", () => {
    const body = "* <div class=\"mw-collapsible\">Odd</div> <nowiki>[[x]] ''y''</nowiki> {{t}} <ref>r</ref> [[Z]] fact.";
    const g = generateFans([{ page: page("Pilot", wiki(body), 1), kind: "episode", own: "S1E1" }], resolver, { wikiBase: BASE });
    expect(g.theories.length).toBe(1);
    for (const t of g.theories) expect(`${t.title} ${t.body}`).not.toMatch(/<|\{\{|\[\[|''|mw-/);
  });
});

describe("generateFans", () => {
  const g = generateFans(
    [
      { page: page("Pilot", wiki("* Plain fact about the pilot.\n** nested note\n* See [[Fifth]] for more.\n* Mentions [[Early Person]] only.\n* Mentions [[Unknown Place]].\n*   ")), kind: "episode", own: "S1E1" },
      { page: page("Early Person", wiki("* A fun fact with ''markup'' and [[Two|the second]] ref<ref>cite</ref>."), 3), kind: "character", own: "S1E2", last: "S1E2" },
      { page: page("Lost Person", wiki("* Orphan fact."), 4), kind: "character", own: null },
    ],
    resolver,
    { wikiBase: BASE },
  );
  const by = (needle: string) => g.theories.find((t) => t.body.includes(needle))!;

  it("takes only the Trivia section; one item per top-level bullet; empty bullets dropped", () => {
    expect(g.theories).toHaveLength(6);
    expect(g.theories.some((t) => t.body.includes("not trivia"))).toBe(false);
  });
  it("spoils_up_to is the page's own episode when nothing is linked; nested bullets stay in their parent", () => {
    expect(by("Plain fact").spoils_up_to).toBe("S1E1");
    expect(by("Plain fact").body).toBe("Plain fact about the pilot. nested note");
  });
  it("uses the max of linked episodes and linked characters' introduction", () => {
    expect(by("See").spoils_up_to).toBe("S2E5");
    expect(g.theories.find((t) => t.body.startsWith("Mentions Early Person"))!.spoils_up_to).toBe("S1E2");
    expect(by("fun fact").spoils_up_to).toBe("S1E2");
  });
  it("unresolvable links or no own episode gate at the finale", () => {
    expect(g.theories.find((t) => t.body.includes("Unknown Place"))!.spoils_up_to).toBe("S7E13");
    expect(by("Orphan").spoils_up_to).toBe("S7E13");
  });
  it("fills title, stripped body, url with oldid, author, tags and a hash key", () => {
    const t = by("fun fact");
    expect(t.body).toBe("A fun fact with markup and the second ref.");
    expect(t.title).toBe("A fun fact with markup and the second…");
    expect(t).toMatchObject({ url: `${BASE}Early_Person?oldid=3`, author: "Fandom contributors", tags: ["trivia"] });
    expect(t.key).toMatch(/^t-[0-9a-f]{12}$/);
    expect(new Set(g.theories.map((x) => x.key)).size).toBe(g.theories.length);
  });
  it("truncates long titles to about eight words and gates text mentions of codes/seasons", () => {
    const r = generateFans(
      [{ page: page("Pilot", wiki("* One two three four five six seven eight nine ten.\n* Back in S2E5 something.\n* In season 2 stuff.")), kind: "episode", own: "S1E1" }],
      resolver,
      { wikiBase: BASE },
    );
    expect(r.theories.find((t) => t.body.startsWith("One"))!.title).toBe("One two three four five six seven eight…");
    expect(r.theories.find((t) => t.body.includes("S2E5"))!.spoils_up_to).toBe("S2E5");
    expect(r.theories.find((t) => t.body.includes("season 2"))!.spoils_up_to).toBe("S2E5");
  });
  it("joins continuation lines to their bullet so hidden links still gate it", () => {
    const r = generateFans([{ page: page("Pilot", wiki("* first line\ncontinues with [[Fifth]]")), kind: "episode", own: "S1E1" }], resolver, { wikiBase: BASE });
    expect(r.theories[0]!.spoils_up_to).toBe("S2E5");
  });
  it("counts stats", () => {
    expect(g.stats).toMatchObject({ items: 6, unresolvedLinkItems: 1, noOwnEpisodeItems: 1 });
  });
});

describe("generateFans spoiler gating of plain text", () => {
  const run = (kind: "episode" | "character", own: string, body: string, last?: string | null) =>
    generateFans(
      [{ page: page("Pilot", wiki(body)), kind, own, ...(last !== undefined ? { last } : {}) }],
      resolver,
      { wikiBase: BASE },
    ).theories.map((t) => t.spoils_up_to);

  it("character bullets gate at the character's last episode", () => {
    expect(run("character", "S1E1", "* Plain fact.", "S2E5")).toEqual(["S2E5"]);
  });
  it("character bullets take the max of last, links and explicit mentions", () => {
    expect(run("character", "S1E1", "* Fact [[Two]].", "S1E1")).toEqual(["S1E2"]);
    expect(run("character", "S1E1", "* Fact [[Two]].", "S2E5")).toEqual(["S2E5"]);
    expect(run("character", "S1E1", "* Fact from S2E5.", "S1E2")).toEqual(["S2E5"]);
  });
  it("character bullets without a known last gate at the finale", () => {
    expect(run("character", "S1E1", "* Plain fact.", null)).toEqual(["S7E13"]);
    expect(run("character", "S1E1", "* Plain fact.")).toEqual(["S7E13"]);
  });
  it.each([
    "He later became rich.", "Eventually he left.", "She would return.", "The final scene.",
    "Seen in the last episode.", "He dies here.", "Someone is killed.", "It is revealed to be a lie.",
    "It turns out fine.", "Compare season 7 events.", "Like the series finale.",
  ])("episode bullets with future-knowledge words gate at the finale: %s", (b) => {
    expect(run("episode", "S1E1", `* ${b}`)).toEqual(["S7E13"]);
  });
  it("episode bullets without those words stay at the page episode; last is ignored", () => {
    expect(run("episode", "S1E1", "* Plain fact about a lasting thing, wouldn't matter.", "S2E5")).toEqual(["S1E1"]);
    expect(run("episode", "S1E1", "* Mentions [[Early Person]].")).toEqual(["S1E2"]);
  });
});

describe("generateFans explicit mentions and plain-text titles/names", () => {
  const eps2 = [ep(1, 1, "Pilot"), ep(1, 2, "Second One"), ep(2, 5, "Fifth"), ep(6, 15, "Late Case"), ep(6, 24, "Season End"), ep(7, 13, "Finale Ep")];
  const persons2 = new Map([["early person", { key: "p-early-person", introduced: "S1E2" }], ["late person", { key: "p-late", introduced: "S6E15" }]]);
  const res = createLinkResolver({ episodes: eps2, persons: persons2 });
  const chars = [ch("Late Person", { gatingAlias: "Latia Person" }), ch("Early Person")];
  const phrases = buildPhrases(
    [{ ...eps2[3]!, title: "Quite Late Case" }, { ...eps2[0]!, title: "Pilot" }, { ...eps2[1]!, title: "Two" }, { ...eps2[2]!, title: "Fifth Wheel" }],
    chars,
    persons2,
  );
  const run = (body: string, own = "S1E1") =>
    generateFans([{ page: page("Pilot", wiki(`* ${body}`)), kind: "episode", own }], res, { wikiBase: BASE, phrases }).theories[0]!.spoils_up_to;

  it.each([
    ["In season, 6 episode 15 it ends.", "S6E15"],
    ["In Season 6, Episode 15.", "S6E15"],
    ["See episode 15 of season 6.", "S6E15"],
    ["See S6E15 here.", "S6E15"],
    ["See 6x15 here.", "S6E15"],
    ["Happens in the sixth season.", "S6E24"],
    ["Happens in the 6th season.", "S6E24"],
    ["Happens in season 2.", "S2E5"],
    ["In season 6 episode 3 it ends.", "S6E3"],
  ])("explicit mention %s gates at %s", (b, code) => {
    expect(run(b)).toBe(code);
  });
  it("a season beyond the series gates at the finale", () => {
    expect(run("Happens in season 9.")).toBe("S7E13");
  });
  it("episode titles as plain text gate at that episode (whole phrase, any case)", () => {
    expect(run("It foreshadows quite LATE case somehow.")).toBe("S6E15");
    expect(run("It foreshadows fifth wheel somehow.")).toBe("S2E5");
    expect(run("It foreshadows the quite late cases.")).toBe("S1E1");
  });
  it("short or common titles are ignored", () => {
    expect(run("Compare two things.")).toBe("S1E1");
    expect(run("A pilot light.")).toBe("S1E1");
  });
  it("character names as plain text gate at their introduction", () => {
    expect(run("Looks like latia person was there.")).toBe("S6E15");
    expect(run("Looks like early person was there.")).toBe("S1E2");
  });
  it("character-page bullets with future words gate at the finale", () => {
    const r = generateFans([{ page: page("Early Person", wiki("* Later implied something.")), kind: "character", own: "S1E2", last: "S1E2" }], res, { wikiBase: BASE });
    expect(r.theories[0]!.spoils_up_to).toBe("S7E13");
  });
});
