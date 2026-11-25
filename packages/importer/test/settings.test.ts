import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadSettings, redact } from "../src/settings.ts";

const dir = mkdtempSync(join(tmpdir(), "imp-settings-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
let n = 0;
function file(content: string): string {
  const p = join(dir, `s${n++}.txt`);
  writeFileSync(p, content);
  return p;
}

describe("loadSettings", () => {
  it("parses KEY=value, comments, blanks, whitespace and quotes", () => {
    const s = loadSettings(
      file(
        [
          "# comment",
          "",
          "  FANDOM_API =  https://example.test/api.php  ",
          'TMDB_API_KEY="fake-key-123"',
          "TMDB_SHOW_ID='42'",
          "TMDB_LANGUAGE=es-AR",
          "UNKNOWN=zzz",
          "no equals line",
        ].join("\n"),
      ),
    );
    expect(s).toEqual({
      fandomApi: "https://example.test/api.php",
      tmdbApiKey: "fake-key-123",
      tmdbShowId: 42,
      tmdbLanguage: "es-AR",
    });
  });

  it("applies defaults for empty or absent values; key optional", () => {
    const s = loadSettings(file("TMDB_API_KEY=\nTMDB_SHOW_ID=\r\nTMDB_LANGUAGE=\n"));
    expect(s.fandomApi).toBe("https://thementalist.fandom.com/api.php");
    expect(s.tmdbShowId).toBe(5920);
    expect(s.tmdbLanguage).toBe("en-US");
    expect(s.tmdbApiKey).toBeUndefined();
  });

  it("keeps '=' inside values", () => {
    expect(loadSettings(file("TMDB_API_KEY=ab=cd==")).tmdbApiKey).toBe("ab=cd==");
  });

  it("rejects a non-numeric show id without echoing the value", () => {
    expect(() => loadSettings(file("TMDB_SHOW_ID=abc"))).toThrow(/TMDB_SHOW_ID/);
  });

  it("missing file tells the user to copy the example", () => {
    expect(() => loadSettings(join(dir, "nope.txt"))).toThrow(
      /copy data-sources\.example\.txt to data-sources\.txt/i,
    );
  });
});

describe("redact", () => {
  it("hides the key but keeps other fields", () => {
    const s = loadSettings(file("TMDB_API_KEY=supersecret"));
    const r = redact(s);
    expect(JSON.stringify(r)).not.toContain("supersecret");
    expect(r.tmdbShowId).toBe(5920);
    expect(r.tmdbApiKey).toBe("***");
  });
  it("leaves an absent key absent", () => {
    expect(redact(loadSettings(file(""))).tmdbApiKey).toBeUndefined();
  });
});

describe("TMDB_SHOW_ID validation", () => {
  it.each(["0", "00", "-5", "1.5", "abc", "9007199254740993", "99999999999999999999"])(
    "rejects %s without echoing it",
    (v) => {
      let msg = "";
      try {
        loadSettings(file(`TMDB_SHOW_ID=${v}`));
      } catch (e) {
        msg = (e as Error).message;
      }
      expect(msg).toMatch(/TMDB_SHOW_ID/);
      expect(msg).not.toContain(v);
    },
  );
  it("skips TMDB validation when asked (--skip-tmdb)", () => {
    expect(loadSettings(file("TMDB_SHOW_ID=0"), { tmdb: false }).tmdbShowId).toBe(5920);
  });
  it("accepts a positive safe integer", () => {
    expect(loadSettings(file("TMDB_SHOW_ID=1399")).tmdbShowId).toBe(1399);
  });
});
