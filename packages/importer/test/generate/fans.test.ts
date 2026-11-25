import { describe, expect, it } from "vitest";
import { generateFans } from "../../src/generate/fans.ts";
import { createLinkResolver } from "../../src/generate/links.ts";
import { BASE, ep, page } from "./helpers.ts";

const eps = [ep(1, 1, "Pilot"), ep(1, 2, "Two"), ep(2, 5, "Later")];
const persons = new Map([["early person", { key: "p-early-person", introduced: "S1E2" }]]);
const resolver = createLinkResolver({ episodes: eps, persons });
const wiki = (body: string) => `Intro\n==Trivia==\n${body}\n==Gallery==\n* not trivia [[Later]]`;

describe("generateFans", () => {
  const g = generateFans(
    [
      { page: page("Pilot", wiki("* Plain fact about the pilot.\n** nested note\n* See [[Later]] for more.\n* Mentions [[Early Person]] only.\n* Mentions [[Unknown Place]].\n*   ")), kind: "episode", own: "S1E1" },
      { page: page("Early Person", wiki("* A fun fact with ''markup'' and [[Two|the second]] ref<ref>cite</ref>."), 3), kind: "character", own: "S1E2" },
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
      [{ page: page("Pilot", wiki("* One two three four five six seven eight nine ten.\n* Later in S2E5 something.\n* In season 2 stuff.")), kind: "episode", own: "S1E1" }],
      resolver,
      { wikiBase: BASE },
    );
    expect(r.theories.find((t) => t.body.startsWith("One"))!.title).toBe("One two three four five six seven eight…");
    expect(r.theories.find((t) => t.body.includes("S2E5"))!.spoils_up_to).toBe("S2E5");
    expect(r.theories.find((t) => t.body.includes("season 2"))!.spoils_up_to).toBe("S2E5");
  });
  it("joins continuation lines to their bullet so hidden links still gate it", () => {
    const r = generateFans([{ page: page("Pilot", wiki("* first line\ncontinues with [[Later]]")), kind: "episode", own: "S1E1" }], resolver, { wikiBase: BASE });
    expect(r.theories[0]!.spoils_up_to).toBe("S2E5");
  });
  it("counts stats", () => {
    expect(g.stats).toMatchObject({ items: 6, unresolvedLinkItems: 1, noOwnEpisodeItems: 1 });
  });
});
