import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../src/cli.ts";

describe("parseCliArgs", () => {
  it("defaults", () => {
    expect(parseCliArgs([])).toEqual({ skipTmdb: false, offline: false, cacheDir: undefined });
  });
  it("parses flags", () => {
    expect(parseCliArgs(["--skip-tmdb", "--offline", "--cache-dir", "x"])).toEqual({
      skipTmdb: true, offline: true, cacheDir: "x",
    });
  });
  it("rejects unknown options and positionals", () => {
    expect(() => parseCliArgs(["--nope"])).toThrow();
    expect(() => parseCliArgs(["extra"])).toThrow();
  });
});
