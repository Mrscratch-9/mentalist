import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";

// Checks the real canon by counts only: it must never print canon text (spoilers).
const dir = fileURLToPath(new URL("../../../data/canon/", import.meta.url));
const docs = readdirSync(dir)
  .filter((f) => /^episodes-s\d+\.yaml$/.test(f))
  .sort()
  .map((f) => ({ f, d: parse(readFileSync(dir + f, "utf8")) }));

type Ep = { code: string; title?: string; synopsis?: string; details?: string };
type Src = { kind: string; url?: string; episode?: string };

describe("real canon (counts only)", () => {
  it("has 151 episodes, 23/23/24/24/22/22/13, with consecutive codes", () => {
    const per = docs.map(({ f, d }) => {
      const s = Number(/s(\d+)/.exec(f)![1]);
      const bad = (d.episodes as Ep[]).filter((e, i) => e.code !== `S${s}E${i + 1}`).length;
      expect(bad).toBe(0);
      return d.episodes.length;
    });
    expect(per).toEqual([23, 23, 24, 24, 22, 22, 13]);
  });

  it("has exactly one https episode source per episode", () => {
    for (const { d } of docs) {
      const n = new Map<string, number>();
      for (const src of d.sources as Src[]) {
        expect(src.kind).toBe("episode");
        expect(String(src.url)).toMatch(/^https:\/\//);
        n.set(String(src.episode), (n.get(String(src.episode)) ?? 0) + 1);
      }
      expect((d.episodes as Ep[]).filter((e) => n.get(e.code) !== 1).length).toBe(0);
      expect(n.size).toBe(d.episodes.length);
    }
  });

  it("keeps synopses short (≤ 200 chars, ≤ 2 sentences), titles set, details empty", () => {
    let violations = 0;
    for (const { d } of docs) {
      for (const e of d.episodes as Ep[]) {
        const s = String(e.synopsis ?? "").trim();
        const sentences = s.split(/(?<=[.!?])["')\]]*\s+(?=\S)/).filter(Boolean).length;
        if (!s || s.length > 200 || sentences > 2 || !String(e.title ?? "").trim() || (e.details ?? "") !== "") violations++;
      }
    }
    expect(violations).toBe(0);
  });
});
