import { describe, expect, it } from "vitest";
import { PROGRESS_KEY, memoryStorage, parseProgressInput } from "./progress";
import { SETTINGS_KEY, createSettingsStore } from "./settings";

describe("settings store", () => {
  it("defaults to Spanish and uses a key separate from progress", () => {
    expect(SETTINGS_KEY).not.toBe(PROGRESS_KEY);
    expect(createSettingsStore(memoryStorage()).get().language).toBe("es");
  });
  it("persists a valid language", () => {
    const s = memoryStorage();
    expect(createSettingsStore(s).setLanguage("en")).toEqual({ ok: true });
    expect(createSettingsStore(s).get().language).toBe("en");
    expect(s.getItem(PROGRESS_KEY)).toBeNull();
  });
  it("falls back to the default on invalid or corrupt values and rejects invalid input", () => {
    for (const raw of ["{", "null", '{"language":"fr"}', '{"language":5}', "[]"]) {
      const s = memoryStorage();
      s.setItem(SETTINGS_KEY, raw);
      expect(createSettingsStore(s).get().language).toBe("es");
    }
    const s = memoryStorage();
    // @ts-expect-error invalid on purpose
    expect(createSettingsStore(s).setLanguage("fr").ok).toBe(false);
    expect(s.getItem(SETTINGS_KEY)).toBeNull();
  });
  it("reports a storage failure without throwing", () => {
    const store = createSettingsStore({ getItem: () => null, setItem: () => { throw new Error("x"); } });
    expect(store.setLanguage("en").ok).toBe(false);
  });
});

describe("progress input in Spanish", () => {
  it("accepts 'fin' like 'end' and keeps previous behaviour", () => {
    expect(parseProgressInput("2", "fin")).toEqual({ season: 2, episode: "end" });
    expect(parseProgressInput("2", " END ")).toEqual({ season: 2, episode: "end" });
    expect(parseProgressInput("2", "x")).toBeNull();
  });
});
