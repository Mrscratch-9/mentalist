import { describe, expect, it } from "vitest";
import { compareCodes, maxCode, slug, wikiUrl } from "../../src/generate/common.ts";
import { createLinkResolver } from "../../src/generate/links.ts";
import { BASE, ep } from "./helpers.ts";

describe("common", () => {
  it("slug", () => {
    expect(slug("Patrick Jane")).toBe("patrick-jane");
    expect(slug("Zoë O'Brien (Agent)")).toBe("zoe-o-brien-agent");
  });
  it("compares and maxes codes numerically", () => {
    expect(compareCodes("S1E10", "S1E9")).toBeGreaterThan(0);
    expect(compareCodes("S2E1", "S1E23")).toBeGreaterThan(0);
    expect(maxCode(["S1E2", "S3E1", "S2E9"])).toBe("S3E1");
    expect(maxCode([])).toBeNull();
  });
  it("wikiUrl underscores, encodes and appends oldid", () => {
    expect(wikiUrl(BASE, "Red Hair & Silver?", 5)).toBe(`${BASE}Red_Hair_%26_Silver%3F?oldid=5`);
    expect(wikiUrl(BASE, "Pilot")).toBe(`${BASE}Pilot`);
  });
});

describe("link resolver", () => {
  const eps = [ep(1, 1, "Pilot"), ep(1, 2, "Two"), ep(3, 23, "Double", 1), ep(3, 24, "Double", 1)];
  const r = createLinkResolver({
    episodes: eps,
    redirects: new Map([["Pilot Ep", "Pilot"]]),
    persons: new Map([["patrick jane", { key: "p-patrick-jane", introduced: "S1E1" }]]),
  });
  it("resolves episodes, redirects, double pages and seasons", () => {
    expect(r.episode("pilot")).toEqual({ first: "S1E1", last: "S1E1" });
    expect(r.episode("Pilot Ep")).toEqual({ first: "S1E1", last: "S1E1" });
    expect(r.episode("Double")).toEqual({ first: "S3E23", last: "S3E24" });
    expect(r.code("Season 3")).toBe("S3E24");
    expect(r.code("Season 4")).toBeNull();
  });
  it("resolves persons and the latest implied code", () => {
    expect(r.person("Patrick_Jane")).toEqual({ key: "p-patrick-jane", introduced: "S1E1" });
    expect(r.code("Double")).toBe("S3E24");
    expect(r.code("Patrick Jane")).toBe("S1E1");
    expect(r.code("Nowhere")).toBeNull();
  });
});
