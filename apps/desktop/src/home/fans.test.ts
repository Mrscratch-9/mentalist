/// <reference types="node" />
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  KnowledgeEngine, loadDataset, progress,
  type Dataset, type SqlDriver, type SqlValue, type Theory,
} from "@mentalist/core";
import { createProgressStore, memoryStorage, PROGRESS_KEY } from "../state/progress";
import { buildFansModel, FANS_AUTHOR, FANS_LICENCE, resolveHome } from "./viewModel";

function nodeDriver(): SqlDriver {
  const raw = new DatabaseSync(":memory:");
  return {
    all: <T>(sql: string, p?: SqlValue[]) => raw.prepare(sql).all(...(p ?? [])) as T[],
    get: <T>(sql: string, p?: SqlValue[]) => raw.prepare(sql).get(...(p ?? [])) as T | undefined,
    exec: (sql, p) => {
      if (p && p.length) raw.prepare(sql).run(...p);
      else raw.exec(sql);
    },
  };
}

// Synthetic data only; revealed strings carry a CANARY_EP_n token.
const episodes = [1, 2, 3, 4].map((n) => ({
  epIndex: n, season: 1, number: n, title: `Title ${n}`, synopsis: `Synopsis ${n}`, details: "",
}));
const theory = (id: string, title: string, spoilsUpTo: number, tags: string[] = []): Theory =>
  ({
    id, title, body: `Body of ${title}`, sourceUrl: `https://wiki.example/${id}?oldid=${spoilsUpTo}`,
    authorHandle: null, spoilsUpTo, tags,
  }) as unknown as Theory;

function dataset(theories: Theory[]): Dataset {
  return { episodes, entities: [], claims: [], arcItems: [], theories };
}
function setup(theories: Theory[]) {
  const db = nodeDriver();
  loadDataset(db, dataset(theories));
  return { db, engine: new KnowledgeEngine(db) };
}
const sample = () => [
  theory("t4", "Zeta CANARY_EP_4", 4),
  theory("t2b", "Beta CANARY_EP_2", 2, ["trivia"]),
  theory("t2a", "Alpha CANARY_EP_2", 2),
  theory("t1", "Omega CANARY_EP_1", 1),
];

describe("buildFansModel", () => {
  it("empty canon: no notes, count 0", () => {
    const { engine } = setup([]);
    expect(buildFansModel(engine, progress(4))).toEqual({ notes: [], count: 0 });
  });

  it("nothing visible before the first episode", () => {
    const { engine } = setup(sample());
    expect(buildFansModel(engine, progress(0))).toEqual({ notes: [], count: 0 });
  });

  it("gated at p: only notes with spoils_up_to <= p, ordered by spoils_up_to then title", () => {
    const { engine } = setup(sample());
    const m = buildFansModel(engine, progress(2));
    expect(m.notes.map((n) => n.title)).toEqual(["Omega CANARY_EP_1", "Alpha CANARY_EP_2", "Beta CANARY_EP_2"]);
    expect(m.count).toBe(3);
    expect(JSON.stringify(m)).not.toMatch(/CANARY_EP_4/);
  });

  it("every note is non-canon and carries source, author, licence and episode code", () => {
    const { engine } = setup(sample());
    const n = buildFansModel(engine, progress(1)).notes[0]!;
    expect(n).toEqual({
      id: "t1", title: "Omega CANARY_EP_1", body: "Body of Omega CANARY_EP_1",
      sourceUrl: "https://wiki.example/t1?oldid=1", author: "Fandom contributors",
      licence: "CC BY-SA 3.0 — adapted from The Mentalist Wiki", code: "1x01", tags: [], canon: false,
    });
    expect(FANS_AUTHOR).toBe("Fandom contributors");
    expect(FANS_LICENCE).toBe("CC BY-SA 3.0 — adapted from The Mentalist Wiki");
  });
});

describe("resolveHome fans", () => {
  const canon = () => setup(sample());

  it("stored progress gates the fans list", () => {
    const r = resolveHome(canon(), { season: 1, episode: 2 }, false);
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.fans.count).toBe(3);
  });

  it("peek (p+1) reveals the next notes, counts from visible rows, nothing persisted", () => {
    const storage = memoryStorage();
    const store = createProgressStore(storage, { season: 1, episode: 3 });
    const r = resolveHome(canon(), store.get(), true);
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.fans.notes.map((n) => n.id)).toEqual(["t1", "t2a", "t2b", "t4"]);
    expect(r.fans.count).toBe(r.fans.notes.length);
    expect(storage.getItem(PROGRESS_KEY)).toBeNull();
    expect(store.get()).toEqual({ season: 1, episode: 3 });
  });

  it("without peek the same progress hides the next note", () => {
    const r = resolveHome(canon(), { season: 1, episode: 3 }, false);
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.fans.notes.map((n) => n.id)).toEqual(["t1", "t2a", "t2b"]);
  });

  it("empty canon gives the empty list", () => {
    const r = resolveHome(setup([]), { season: 1, episode: 2 }, false);
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.fans).toEqual({ notes: [], count: 0 });
  });
});
