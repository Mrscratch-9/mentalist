import { describe, expect, it } from "vitest";
import {
  OWNER_PROGRESS,
  PROGRESS_KEY,
  createProgressStore,
  memoryStorage,
  parseProgressInput,
  type StorageAdapter,
} from "./progress";

describe("progress store", () => {
  it("defaults to the owner's configured value: end of season 5", () => {
    const store = createProgressStore(memoryStorage());
    expect(OWNER_PROGRESS).toEqual({ season: 5, episode: "end" });
    expect(store.get()).toEqual({ season: 5, episode: "end" });
  });

  it("persists a valid update and reloads it from storage", () => {
    const storage = memoryStorage();
    const store = createProgressStore(storage);
    expect(store.set({ season: 2, episode: 7 })).toEqual({ ok: true });
    expect(store.get()).toEqual({ season: 2, episode: 7 });
    expect(createProgressStore(storage).get()).toEqual({ season: 2, episode: 7 });
  });

  it("accepts an explicit end-of-season episode", () => {
    const store = createProgressStore(memoryStorage());
    expect(store.set({ season: 3, episode: "end" }).ok).toBe(true);
    expect(store.get()).toEqual({ season: 3, episode: "end" });
  });

  it.each([
    { season: 0, episode: 1 },
    { season: -1, episode: 1 },
    { season: 1.5, episode: 1 },
    { season: 2, episode: 0 },
    { season: 2, episode: 2.5 },
    { season: 2, episode: "last" },
    { season: Number.NaN, episode: 1 },
    { season: "2", episode: 1 },
    null,
  ])("rejects invalid input %j and leaves storage unchanged", (bad) => {
    const storage = memoryStorage();
    const store = createProgressStore(storage);
    store.set({ season: 4, episode: 3 });
    const before = storage.getItem(PROGRESS_KEY);
    const result = store.set(bad as never);
    expect(result.ok).toBe(false);
    expect(storage.getItem(PROGRESS_KEY)).toBe(before);
    expect(store.get()).toEqual({ season: 4, episode: 3 });
  });

  it("falls back to the configured value when stored data is corrupt", () => {
    const storage = memoryStorage();
    storage.setItem(PROGRESS_KEY, "{not json");
    expect(createProgressStore(storage).get()).toEqual(OWNER_PROGRESS);
  });

  it("never writes a peek to storage", () => {
    const storage = memoryStorage();
    const store = createProgressStore(storage);
    store.set({ season: 1, episode: 4 });
    const before = storage.getItem(PROGRESS_KEY);
    store.startPeek({ season: 1, episode: 5 });
    expect(store.effective()).toEqual({ season: 1, episode: 5 });
    expect(store.get()).toEqual({ season: 1, episode: 4 });
    expect(storage.getItem(PROGRESS_KEY)).toBe(before);
    expect(createProgressStore(storage).effective()).toEqual({ season: 1, episode: 4 });
    store.clearPeek();
    expect(store.effective()).toEqual({ season: 1, episode: 4 });
  });

  it("rejects an invalid peek", () => {
    const store = createProgressStore(memoryStorage());
    expect(store.startPeek({ season: 0, episode: 1 }).ok).toBe(false);
    expect(store.effective()).toEqual(OWNER_PROGRESS);
  });
});

describe("progress store with failing storage", () => {
  const throwing: StorageAdapter = {
    getItem: () => {
      throw new Error("storage disabled");
    },
    setItem: () => {
      throw new Error("quota exceeded");
    },
  };

  it("set returns an error result instead of throwing", () => {
    const store = createProgressStore(throwing);
    const result = store.set({ season: 2, episode: 3 });
    expect(result).toEqual({ ok: false, error: "Could not save progress." });
  });

  it("get falls back to the configured value", () => {
    const store = createProgressStore(throwing);
    expect(store.get()).toEqual(OWNER_PROGRESS);
  });
});

describe("parseProgressInput", () => {
  it.each([
    ["5", "end", { season: 5, episode: "end" }],
    ["5", " End ", { season: 5, episode: "end" }],
    [" 2 ", "7", { season: 2, episode: 7 }],
  ])("parses season %j episode %j", (season, episode, expected) => {
    expect(parseProgressInput(season, episode)).toEqual(expected);
  });

  it.each([
    ["", "3"],
    ["2", ""],
    ["abc", "3"],
    ["2", "x"],
    ["0", "3"],
    ["2", "1.5"],
    ["-1", "end"],
  ])("rejects season %j episode %j", (season, episode) => {
    expect(parseProgressInput(season, episode)).toBeNull();
  });
});
