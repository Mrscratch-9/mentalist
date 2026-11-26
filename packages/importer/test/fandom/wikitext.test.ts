import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  extractBullets,
  extractLinks,
  findTemplate,
  parseTemplates,
  splitSections,
  plainText,
  stripMarkup,
} from "../../src/fandom/wikitext.ts";

const pilot = readFileSync(new URL("./fixtures/pilot-infobox.wiki", import.meta.url), "utf8");

describe("parseTemplates", () => {
  it("parses nested templates and closing braces on the same line", () => {
    const t = parseTemplates("{{Infobox episode|a=1|b={{x|y=2}}|c=[[L|lbl]]}}tail");
    const info = t.find((x) => x.name === "infobox episode");
    expect(info?.params).toEqual({ a: "1", b: "{{x|y=2}}", c: "[[L|lbl]]" });
  });
  it("keeps pipes inside links and nowiki out of param splitting", () => {
    const t = findTemplate("{{Infobox character|name=<nowiki>a|b}}</nowiki>|actor=[[A|B]]}}", ["infobox character"]);
    expect(t?.params.actor).toBe("[[A|B]]");
    expect(t?.params.name).toBe("<nowiki>a|b}}</nowiki>");
  });
  it("normalizes names (underscores, case) and params keys to lowercase", () => {
    const t = findTemplate("{{Infobox_episode\n|Title = X \n|Aired=Y\n}}", ["infobox episode"]);
    expect(t?.params).toEqual({ title: "X", aired: "Y" });
  });
  it("parses the real pilot infobox", () => {
    const t = findTemplate(pilot, ["infobox episode"]);
    expect(t?.params.season).toBe("1");
    expect(t?.params.guests).toContain("<br/>");
  });
  it("returns null when absent and tolerates unclosed templates", () => {
    expect(findTemplate("plain", ["infobox episode"])).toBeNull();
    expect(parseTemplates("{{Infobox episode|a=1")).toEqual([]);
  });
});

describe("links and markup", () => {
  it("extracts targets and labels, skipping files and categories", () => {
    const l = extractLinks("[[Season 4|4]] [[Patrick Jane]] [[File:x.jpg|thumb]] [[Category:Z]] [[Page#Sec|s]]");
    expect(l).toEqual([
      { target: "Season 4", label: "4" },
      { target: "Patrick Jane", label: "Patrick Jane" },
      { target: "Page", label: "s" },
    ]);
  });
  it("strips markup to plain text", () => {
    expect(stripMarkup("'''[[A|b]]''' <small>(x)</small><br>y <nowiki>[[z]]</nowiki><!-- c -->")).toBe("b (x) y [[z]]");
  });
  it("strips every tag and refs; plainText also strips templates", () => {
    expect(stripMarkup('<div class="mw-collapsible mw-collapsed">A<ref name="r">src</ref><ref name=q /> B</div>')).toBe("A B");
    expect(stripMarkup('x <div class="mw-collapsible')).toBe("x");
    expect(plainText("a {{t|{{u}}}} b")).toBe("a b");
  });
  it("plainText leaves no markup sequence at all", () => {
    const out = plainText("<p>It's ''odd'' [[x]] {{y}} <nowiki>[[z]] ''q''</nowiki> mw-body &lt;b&gt; mw-</p>");
    expect(out).not.toMatch(/<|\{\{|\[\[|''|mw-/);
    expect(out).toContain("odd");
  });
});

describe("sections and bullets", () => {
  it("splits by heading with level and a lead", () => {
    const s = splitSections(pilot);
    expect(s.map((x) => [x.heading, x.level])).toEqual([["", 0], ["Recap", 2], ["Trivia", 2], ["Gallery", 2]]);
    expect(s[2]?.text).toContain("Bullet two.");
  });
  it("extracts bullets with depth", () => {
    const trivia = splitSections(pilot).find((x) => x.heading === "Trivia")!;
    expect(extractBullets(trivia.text)).toEqual([
      { depth: 1, text: "Bullet one mentions [[Season 1|1]] only." },
      { depth: 2, text: "Nested bullet." },
      { depth: 1, text: "Bullet two." },
    ]);
  });
});
