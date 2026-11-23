/// <reference types="node" />
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  KnowledgeEngine, NotFoundError, loadDataset, peek,
  type Dataset, type Episode, type SqlDriver, type SqlValue,
} from "@mentalist/core";
import { listBySeason, resolveEpisodeList, toCoreProgress } from "./coreProgress";

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

const ep = (epIndex: number, season: number, number: number): Episode => ({
  epIndex, season, number,
  title: `Title ${season}x${number}`, synopsis: `Synopsis ${season}x${number}`,
  details: `SECRET DETAILS ${season}x${number}`,
});

const data = (): Dataset => ({
  episodes: [ep(1, 1, 1), ep(2, 1, 2), ep(3, 1, 3), ep(4, 2, 1), ep(5, 2, 2)],
  entities: [], claims: [], arcItems: [], theories: [],
});

function setup() {
  const db = nodeDriver();
  loadDataset(db, data());
  return { db, engine: new KnowledgeEngine(db) };
}

describe("toCoreProgress", () => {
  it("maps season/episode to the global ep_index", () => {
    const { db } = setup();
    expect(toCoreProgress(db, { season: 1, episode: 2 }).epIndex).toBe(2);
    expect(toCoreProgress(db, { season: 2, episode: 1 }).epIndex).toBe(4);
  });

  it("maps \"end\" to the last episode of the season", () => {
    const { db } = setup();
    expect(toCoreProgress(db, { season: 1, episode: "end" }).epIndex).toBe(3);
    expect(toCoreProgress(db, { season: 2, episode: "end" }).epIndex).toBe(5);
  });

  it.each([
    { season: 1, episode: 4 },
    { season: 3, episode: 1 },
    { season: 3, episode: "end" as const },
  ])("rejects out-of-range %j", (p) => {
    const { db } = setup();
    expect(() => toCoreProgress(db, p)).toThrow(NotFoundError);
  });

  it("peek moves one episode ahead without changing the original", () => {
    const { db } = setup();
    const p = toCoreProgress(db, { season: 1, episode: 2 });
    expect(peek(p).epIndex).toBe(3);
    expect(p.epIndex).toBe(2);
  });
});

describe("listBySeason", () => {
  it("groups by season and flags unwatched episodes", () => {
    const { db, engine } = setup();
    const groups = listBySeason(engine, toCoreProgress(db, { season: 1, episode: 2 }));
    expect(groups.map((g) => [g.season, g.episodes.map((e) => e.watched)])).toEqual([
      [1, [true, true, false]],
      [2, [false, false]],
    ]);
  });

  it("unwatched rows contain only season, number, title, synopsis", () => {
    const { db, engine } = setup();
    const groups = listBySeason(engine, toCoreProgress(db, { season: 1, episode: 1 }));
    const unwatched = groups.flatMap((g) => g.episodes).filter((e) => !e.watched);
    expect(unwatched).toHaveLength(4);
    for (const e of unwatched) {
      expect(Object.keys(e).sort()).toEqual(["number", "season", "synopsis", "title", "watched"]);
    }
    expect(JSON.stringify(unwatched)).not.toContain("SECRET");
  });

  it("never exposes details for any row", () => {
    const { db, engine } = setup();
    const groups = listBySeason(engine, toCoreProgress(db, { season: 2, episode: "end" }));
    expect(JSON.stringify(groups)).not.toContain("SECRET");
  });
});

describe("resolveEpisodeList", () => {
  it("returns groups for existing progress", () => {
    const { db, engine } = setup();
    const r = resolveEpisodeList({ db, engine }, { season: 1, episode: 2 });
    expect(r.kind).toBe("ok");
  });

  it("returns not-found only for NotFoundError", () => {
    const { db, engine } = setup();
    expect(resolveEpisodeList({ db, engine }, { season: 9, episode: 1 }).kind).toBe("not-found");
  });

  it("returns error for other failures", () => {
    const { engine } = setup();
    const broken: SqlDriver = { all: () => { throw new Error("boom"); }, get: () => { throw new Error("boom"); }, exec: () => {} };
    expect(resolveEpisodeList({ db: broken, engine }, { season: 1, episode: 1 }).kind).toBe("error");
  });
});
