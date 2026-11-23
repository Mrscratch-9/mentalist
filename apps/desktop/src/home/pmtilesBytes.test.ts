import { describe, expect, it } from "vitest";
import { isPmtilesHeader } from "./pmtilesBytes";

const enc = (s: string) => new TextEncoder().encode(s);

describe("isPmtilesHeader", () => {
  it("accepts a buffer that starts with the PMTiles magic", () => {
    const bytes = new Uint8Array(127);
    bytes.set(enc("PMTiles"), 0);
    bytes[7] = 3;
    expect(isPmtilesHeader(bytes)).toBe(true);
  });

  it("rejects an HTML fallback page served with 200", () => {
    expect(isPmtilesHeader(enc("<!doctype html><html><body>index</body></html>"))).toBe(false);
  });

  it("rejects an empty body", () => {
    expect(isPmtilesHeader(new Uint8Array(0))).toBe(false);
  });

  it("rejects a body shorter than the magic and a wrong-case magic", () => {
    expect(isPmtilesHeader(enc("PMTil"))).toBe(false);
    expect(isPmtilesHeader(enc("pmtiles"))).toBe(false);
  });
});
