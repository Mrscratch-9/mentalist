/// <reference types="node" />
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  KnowledgeEngine, loadDataset, progress,
  type Claim, type Dataset, type Entity, type EntityKind, type SqlDriver, type SqlValue,
} from "@mentalist/core";
import { createProgressStore, memoryStorage, PROGRESS_KEY } from "../state/progress";
import { buildHomeModel, resolveHome } from "./viewModel";

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

// Synthetic data only. Every revealed string carries a CANARY_EP_n token.
const episodes = [1, 2, 3, 4, 5].map((n) => ({
  epIndex: n, season: 1, number: n, title: `Title ${n}`, synopsis: `Synopsis ${n}`, details: `CANARY_EP_${n} details`,
}));
const ent = (id: string, kind: EntityKind, introducedIn: number): Entity =>
  ({ id, kind, introducedIn }) as Entity;
const clm = (
  id: string, subject: string, predicate: string, revealedIn: number,
  f: { object?: string; value?: string } = {},
): Claim =>
  ({
    id, subject, predicate, object: f.object ?? null, value: f.value ?? null, revealedIn,
    supersededIn: null, supersededBy: null, status: "confirmed", sourceId: "src", note: "",
  }) as unknown as Claim;

function synthetic(): Dataset {
  return {
    episodes,
    entities: [
      ent("p_a", "person", 1), ent("p_b", "person", 3),
      ent("case_a", "case", 2), ent("case_b", "case", 4),
      ent("loc_a", "location", 2), ent("loc_b", "location", 4),
      ent("evt_a", "event", 3),
    ],
    claims: [
      clm("n_pa", "p_a", "name", 1, { value: "Person CANARY_EP_1" }),
      clm("r_pa", "p_a", "role", 1, { value: "Consultant CANARY_EP_1" }),
      clm("n_pb", "p_b", "name", 3, { value: "Mara Quill CANARY_EP_3" }),
      clm("n_ca", "case_a", "name", 2, { value: "Case A CANARY_EP_2" }),
      clm("n_cb", "case_b", "name", 4, { value: "Case B CANARY_EP_4" }),
      clm("n_la", "loc_a", "name", 2, { value: "Dock CANARY_EP_2" }),
      clm("c_la", "loc_a", "coordinates", 2, { value: "38.5,-121.5" }),
      clm("d_la", "loc_a", "description", 2, { value: "A quiet dock CANARY_EP_2" }),
      clm("n_lb", "loc_b", "name", 4, { value: "Tower CANARY_EP_4" }),
      clm("c_lb", "loc_b", "coordinates", 4, { value: "38.6,-121.4" }),
      clm("n_ea", "evt_a", "name", 3, { value: "Mark CANARY_EP_3" }),
      clm("c_ea", "evt_a", "coordinates", 3, { value: "38.55,-121.45" }),
      clm("s_ea", "evt_a", "red_john_smiley", 3, { value: "yes" }),
      clm("k_ea", "evt_a", "part_of_case", 3, { object: "case_a" }),
      clm("ro_pb", "p_b", "role_in_case", 3, { object: "case_a", value: "perpetrator" }),
    ],
    arcItems: [], theories: [],
  };
}

function setup(data: Dataset = synthetic()) {
  const db = nodeDriver();
  loadDataset(db, data);
  return { db, engine: new KnowledgeEngine(db) };
}
const empty = (): Dataset => ({ episodes, entities: [], claims: [], arcItems: [], theories: [] });
const dump = (x: unknown) => JSON.stringify(x);

describe("buildHomeModel: empty canon", () => {
  it("gives empty pins, cases, characters and legend", () => {
    const { engine } = setup(empty());
    const m = buildHomeModel(engine, progress(3));
    expect(m.pins).toEqual([]);
    expect(m.cases).toEqual([]);
    expect(m.characters).toEqual([]);
    expect(m.legend).toEqual([]);
    expect(m.watchedEpisodes).toBe(3);
    expect(m.totalEpisodes).toBe(5);
  });
});

describe("buildHomeModel: synthetic dataset", () => {
  it("shows nothing before the first reveal", () => {
    const { engine } = setup();
    const m = buildHomeModel(engine, progress(0));
    expect([m.pins.length, m.cases.length, m.characters.length]).toEqual([0, 0, 0]);
  });

  it("p=1: only the first character", () => {
    const { engine } = setup();
    const m = buildHomeModel(engine, progress(1));
    expect(m.characters).toEqual([{ id: "p_a", name: "Person CANARY_EP_1", role: "Consultant CANARY_EP_1", initials: "PC" }]);
    expect(m.cases).toEqual([]);
    expect(m.pins).toEqual([]);
  });

  it("p=2: open case and a landmark pin, nothing later", () => {
    const { engine } = setup();
    const m = buildHomeModel(engine, progress(2));
    expect(m.cases).toEqual([
      { id: "case_a", code: "1x02", title: "Case A CANARY_EP_2", solved: false, silhouette: "jane" },
    ]);
    expect(m.pins).toEqual([
      {
        id: "loc_a", label: "Dock CANARY_EP_2", kind: "landmark", position: [-121.5, 38.5],
        caseId: null, description: "A quiet dock CANARY_EP_2",
      },
    ]);
    expect(m.legend.map((l) => l.kind)).toEqual(["landmark", "hover"]);
    expect(dump(m)).not.toMatch(/CANARY_EP_[3-5]/);
  });

  it("p=3: smiley pin linked to its case, case solved, new character", () => {
    const { engine } = setup();
    const m = buildHomeModel(engine, progress(3));
    expect(m.pins.map((x) => [x.id, x.kind, x.caseId])).toEqual([
      ["loc_a", "landmark", null],
      ["evt_a", "smiley", "case_a"],
    ]);
    expect(m.cases[0]?.solved).toBe(true);
    expect(m.characters.map((c) => c.id)).toEqual(["p_a", "p_b"]);
    expect(m.legend.map((l) => l.kind)).toEqual(["smiley", "landmark", "linked", "hover"]);
    expect(dump(m)).not.toMatch(/CANARY_EP_[45]/);
  });

  it("p=4 adds the second case and pin; counts follow visible rows only", () => {
    const { engine } = setup();
    const m = buildHomeModel(engine, progress(4));
    expect(m.cases.map((c) => c.id)).toEqual(["case_a", "case_b"]);
    expect(m.pins).toHaveLength(3);
    expect(dump(m)).not.toMatch(/CANARY_EP_5/);
  });
});

describe("resolveHome", () => {
  const canon = () => setup();

  it("stored progress resolves to the gate and model", () => {
    const r = resolveHome(canon(), { season: 1, episode: 2 }, false);
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.gate).toEqual({ label: "1x02", peeking: false, canPeek: true, peekLabel: null });
    expect(r.model.cases.map((c) => c.id)).toEqual(["case_a"]);
  });

  it("peek shows p+1 and labels it", () => {
    const r = resolveHome(canon(), { season: 1, episode: 2 }, true);
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.gate).toEqual({ label: "1x02", peeking: true, canPeek: true, peekLabel: "1x03" });
    expect(r.model.pins.map((p) => p.kind)).toContain("smiley");
    expect(r.model.watchedEpisodes).toBe(3);
  });

  it("peek never persists anything", () => {
    const storage = memoryStorage();
    const store = createProgressStore(storage, { season: 1, episode: 2 });
    const r = resolveHome(canon(), store.get(), true);
    expect(r.kind).toBe("ok");
    expect(storage.getItem(PROGRESS_KEY)).toBeNull();
    expect(store.get()).toEqual({ season: 1, episode: 2 });
  });

  it("at the last episode peek is not possible and is ignored", () => {
    const r = resolveHome(canon(), { season: 1, episode: 5 }, true);
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.gate).toEqual({ label: "1x05", peeking: false, canPeek: false, peekLabel: null });
    expect(r.model.watchedEpisodes).toBe(5);
  });

  it("end-of-season progress is labelled by its last episode", () => {
    const r = resolveHome(canon(), { season: 1, episode: "end" }, false);
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.gate.label).toBe("1x05");
  });

  it("an unknown season/episode is not-found; nothing leaks", () => {
    expect(resolveHome(canon(), { season: 9, episode: 1 }, false)).toEqual({ kind: "not-found" });
  });
});
