import { describe, expect, it } from "vitest";
import {
  OWNER_PROGRESS,
  PROGRESS_KEY,
  createProgressStore,
  memoryStorage,
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
