import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_UI_LANG, UI_LANGS, STRINGS, t, type StringKey } from "./strings";
import { formatDate, formatNumber, localeOf } from "./format";

const keys = (l: "es" | "en") => Object.keys(STRINGS[l]).sort();

describe("string catalogue", () => {
  it("has the same keys in es and en and no empty text", () => {
    expect(keys("es")).toEqual(keys("en"));
    for (const l of UI_LANGS) for (const [k, v] of Object.entries(STRINGS[l])) expect(v.trim(), `${l}:${k}`).not.toBe("");
  });

  it("uses the same {placeholders} in both languages", () => {
    const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const k of Object.keys(STRINGS.en) as StringKey[]) expect(ph(STRINGS.es[k]), k).toEqual(ph(STRINGS.en[k]));
  });

  it("defaults to Spanish and interpolates", () => {
    expect(DEFAULT_UI_LANG).toBe("es");
    expect(t("en", "episodes.watchedCount", { n: "3", total: "9" })).toBe("3 of 9 episodes watched");
    expect(t("es", "episodes.watchedCount", { n: "3", total: "9" })).toBe("3 de 9 episodios vistos");
    expect(t("es", "nav.settings")).toBe("Configuración");
    expect(t("en", "nav.settings")).toBe("Settings");
  });
});

describe("no hard-coded UI text in the components", () => {
  // Proper names and URLs may appear outside the catalogue.
  const ALLOWED = new Set(["The", "Mentalist", "Archive", "TMDB", "Red John", "The Mentalist Wiki", "CC BY-SA 3.0"]);
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

  function offenders(file: string): string[] {
    const src = strip(readFileSync(new URL(`../home/${file}`, import.meta.url), "utf8"));
    const out: string[] = [];
    // JSX text between tags (not arrow functions or generics).
    for (const m of src.matchAll(/(?<![=-])>([^<>{}=;]*[A-Za-zÁ-ú]{2,}[^<>{}]*)</g)) {
      const text = (m[1] ?? "").trim().replace(/\s+/g, " ");
      // generics and ternaries (`useState<…>(…)`, `) : x ? (`) are code, not text
      if (/^[()]/.test(text) || /[;=]/.test(text)) continue;
      if (text && !ALLOWED.has(text) && !/^https?:\/\//.test(text)) out.push(`text: ${text}`);
    }
    // user-facing attributes written as literals
    for (const m of src.matchAll(/\b(aria-label|title|alt|placeholder|aria-description)="([^"]+)"/g)) out.push(`${m[1]}: ${m[2]}`);
    // string literals that read like sentences or capitalised labels
    for (const m of src.matchAll(/(["'`])([A-Z][a-z]+(?: [A-Za-z]+)*[.…!]?)\1/g)) {
      if (!ALLOWED.has(m[2] ?? "")) out.push(`literal: ${m[2]}`);
    }
    return out;
  }

  for (const f of ["RedRoom.tsx", "Credits.tsx"]) {
    it(`${f} has none`, () => expect(offenders(f)).toEqual([]));
  }
});

describe("locale formatting", () => {
  it("maps the UI language to a locale", () => {
    expect(localeOf("es")).toBe("es-MX");
    expect(localeOf("en")).toBe("en-US");
  });
  it("formats numbers and dates with the selected locale", () => {
    expect(formatNumber("es", 1234567)).toBe("1,234,567"); // es-MX groups with commas
    expect(formatNumber("en", 1234567)).toBe("1,234,567");
    expect(formatDate("es", "2008-09-23")).toBe("23 de septiembre de 2008");
    expect(formatDate("en", "2008-09-23")).toBe("September 23, 2008");
    expect(formatDate("es", "not a date")).toBe("not a date");
  });
});

describe("map accessible name", () => {
  it("RedMap takes its aria-label from the caller", () => {
    const src = readFileSync(new URL("../home/RedMap.tsx", import.meta.url), "utf8");
    expect(src).toContain("aria-label={ariaLabel}");
  });
});
