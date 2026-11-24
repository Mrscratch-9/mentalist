/// <reference types="node" />
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import {
  KnowledgeEngine, loadDataset, peek, progress,
  type Claim, type Dataset, type Entity, type EntityKind, type SqlDriver, type SqlValue,
} from "@mentalist/core";
import { createProgressStore, memoryStorage, PROGRESS_KEY } from "../state/progress";
import { buildHomeModel, currentBase, resolveHome } from "./viewModel";

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
      clm("rec_pa", "p_a", "recurring", 1, { value: "true" }),
      clm("rec_pb", "p_b", "recurring", 3, { value: "true" }),
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

// ---- Discarded / fallback / error cases (state !== current etc.) ----
const sup = (c: Claim, supersededIn: number, supersededBy: string | null = null): Claim =>
  ({ ...c, supersededIn, supersededBy }) as Claim;

describe("buildHomeModel: superseded and discarded claims", () => {
  const data = (): Dataset => ({
    episodes,
    entities: [
      ent("p_a", "person", 1), ent("p_b", "person", 1),
      ent("case_a", "case", 1), ent("case_late", "case", 5),
      ent("loc_a", "location", 1), ent("loc_b", "location", 1),
    ],
    claims: [
      // name replaced at 3
      sup(clm("n_pa_old", "p_a", "name", 1, { value: "Old Name" }), 3, "n_pa_new"),
      clm("n_pa_new", "p_a", "name", 3, { value: "New Name" }),
      // role discarded at 2 with no replacement
      sup(clm("r_pa", "p_a", "role", 1, { value: "Old Role" }), 2),
      // names discarded at 2 with no replacement -> fallbacks
      sup(clm("n_pb", "p_b", "name", 1, { value: "Gone Name" }), 2),
      sup(clm("n_ca", "case_a", "name", 1, { value: "Gone Case" }), 2),
      sup(clm("n_la", "loc_a", "name", 1, { value: "Gone Place" }), 2),
      clm("rec_pa", "p_a", "recurring", 1, { value: "true" }),
      clm("rec_pb", "p_b", "recurring", 1, { value: "true" }),
      clm("c_la", "loc_a", "coordinates", 1, { value: "38.5,-121.5" }),
      sup(clm("d_la", "loc_a", "description", 1, { value: "Gone description" }), 2),
      // smiley and part_of_case discarded at 3
      sup(clm("s_la", "loc_a", "red_john_smiley", 1, { value: "yes" }), 3),
      sup(clm("k_la", "loc_a", "part_of_case", 1, { object: "case_a" }), 3),
      // pin pointing at a case that is not visible yet
      clm("n_lb", "loc_b", "name", 1, { value: "Second" }),
      clm("c_lb", "loc_b", "coordinates", 1, { value: "38.6,-121.4" }),
      clm("k_lb", "loc_b", "part_of_case", 1, { object: "case_late" }),
      // roles: perpetrator discarded at 4; one of two investigators discarded at 4
      sup(clm("ro_perp", "p_a", "role_in_case", 1, { object: "case_a", value: "perpetrator" }), 4),
      clm("ro_i1", "p_a", "role_in_case", 1, { object: "case_a", value: "investigator" }),
      sup(clm("ro_i2", "p_b", "role_in_case", 1, { object: "case_a", value: "investigator" }), 4),
    ],
    arcItems: [], theories: [],
  });
  const at = (n: number, d: Dataset = data()) => buildHomeModel(setup(d).engine, progress(n));

  it("before the supersession the old claims drive values", () => {
    const m = at(1);
    expect(m.characters.map((c) => [c.name, c.role])).toEqual([["Old Name", "Old Role"], ["Gone Name", null]]);
    expect(m.cases[0]).toMatchObject({ title: "Gone Case", solved: true, silhouette: "cbi" });
    expect(m.pins[0]).toMatchObject({ id: "loc_a", label: "Gone Place", kind: "smiley", caseId: "case_a", description: "Gone description" });
  });

  it("a replaced name gives way to its replacement; a discarded one never drives the value", () => {
    const m = at(3);
    expect(m.characters[0]).toMatchObject({ name: "New Name", role: null, initials: "NN" });
    expect(dump(m)).not.toContain("Old Name");
    expect(dump(m)).not.toContain("Old Role");
  });

  it("discarded names fall back to the placeholders", () => {
    const m = at(2);
    expect(m.characters[1]).toMatchObject({ id: "p_b", name: "Unnamed", initials: "U" });
    expect(m.cases[0]?.title).toBe("Untitled case");
    expect(m.pins[0]?.label).toBe("Unnamed place");
    expect(m.pins[0]?.description).toBe("");
    expect(dump(m)).not.toMatch(/Gone/);
  });

  it("a discarded smiley and part_of_case no longer mark or link the pin", () => {
    const m = at(3);
    expect(m.pins.find((x) => x.id === "loc_a")).toMatchObject({ kind: "landmark", caseId: null });
    expect(m.legend.map((l) => l.kind)).toEqual(["landmark", "hover"]);
  });

  it("a part_of_case pointing at a case that is not visible leaves the pin unlinked", () => {
    const m = at(2);
    expect(m.pins.find((x) => x.id === "loc_b")?.caseId).toBeNull();
    expect(dump(m)).not.toContain("case_late");
  });

  it("discarded roles do not solve the case nor count toward the cbi silhouette", () => {
    expect(at(3).cases[0]).toMatchObject({ solved: true, silhouette: "cbi" });
    expect(at(4).cases[0]).toMatchObject({ solved: false, silhouette: "jane" });
  });

  it("one current investigator is jane, two are cbi", () => {
    const d = data();
    d.claims = d.claims.filter((c) => c.id !== "ro_i2");
    expect(at(1, d).cases[0]?.silhouette).toBe("jane");
  });
});

describe("buildHomeModel: characters are recurring persons only", () => {
  const chars = (d: Dataset, n: number) => buildHomeModel(setup(d).engine, progress(n)).characters.map((c) => c.id);
  const base = (claims: Claim[]): Dataset => ({
    episodes,
    entities: [ent("p_a", "person", 1), ent("p_one", "person", 1)],
    claims: [clm("n_a", "p_a", "name", 1, { value: "A" }), clm("n_o", "p_one", "name", 1, { value: "One" }), ...claims],
    arcItems: [], theories: [],
  });

  it("a person without a recurring claim is excluded", () => {
    expect(chars(base([clm("rec", "p_a", "recurring", 1, { value: "true" })]), 3)).toEqual(["p_a"]);
    expect(chars(base([]), 3)).toEqual([]);
  });

  it("a recurring value other than true does not count", () => {
    expect(chars(base([clm("rec", "p_a", "recurring", 1, { value: "false" })]), 3)).toEqual([]);
  });

  it("a recurring claim revealed later shows the person only from that episode", () => {
    const d = base([clm("rec", "p_a", "recurring", 3, { value: "true" })]);
    expect(chars(d, 2)).toEqual([]);
    expect(chars(d, 3)).toEqual(["p_a"]);
  });

  it("a superseded or discarded recurring claim does not count", () => {
    const d = base([sup(clm("rec", "p_a", "recurring", 1, { value: "true" }), 3)]);
    expect(chars(d, 2)).toEqual(["p_a"]);
    expect(chars(d, 3)).toEqual([]);
  });
});

describe("resolveHome: error branch", () => {
  it("an unexpected engine failure gives kind=error without leaking details", () => {
    const { db, engine } = setup();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const boom = Object.create(engine, {
        listEpisodes: { value: () => { throw new Error("CANARY_EP_9 secret"); } },
      }) as KnowledgeEngine;
      expect(resolveHome({ db, engine: boom }, { season: 1, episode: 2 }, false)).toEqual({ kind: "error" });
      expect(dump(spy.mock.calls)).not.toContain("CANARY_EP_9");
    } finally {
      spy.mockRestore();
    }
  });
});

describe("solved cases", () => {
  it("a perpetrator held only as an in-show suspicion does not mark the case solved", () => {
    const data = synthetic();
    data.claims = data.claims.map((c) =>
      (c.id as string) === "ro_pb" ? ({ ...c, status: "in_show_suspicion" } as Claim) : c,
    );
    const { engine } = setup(data);
    expect(buildHomeModel(engine, progress(3)).cases[0]?.solved).toBe(false);
  });
});

describe("currentBase: camera follows the current team_base claim", () => {
  const base = (extra: Claim[] = [], supersede = true): Dataset => ({
    episodes,
    entities: [ent("loc_old", "location", 1), ent("loc_new", "location", 4), ent("loc_x", "location", 1)],
    claims: [
      clm("n_old", "loc_old", "name", 1, { value: "Old HQ CANARY_EP_1" }),
      clm("c_old", "loc_old", "coordinates", 1, { value: "38.5,-121.5" }),
      supersede
        ? sup(clm("tb_old", "loc_old", "team_base", 1, { value: "true" }), 4, "tb_new")
        : clm("tb_old", "loc_old", "team_base", 1, { value: "true" }),
      clm("n_new", "loc_new", "name", 4, { value: "New HQ CANARY_EP_4" }),
      clm("c_new", "loc_new", "coordinates", 4, { value: "30.27,-97.74" }),
      clm("tb_new", "loc_new", "team_base", 4, { value: "true" }),
      clm("c_x", "loc_x", "coordinates", 1, { value: "40,-100" }), // a place that is not a base
      ...extra,
    ],
    arcItems: [], theories: [],
  });
  const at = (data: Dataset, n: number) => {
    const { engine } = setup(data);
    return currentBase(engine, progress(n));
  };

  it("before the move: the old base", () => {
    expect(at(base(), 3)).toEqual({ id: "loc_old", position: [-121.5, 38.5] });
  });
  it("after the move: the new base, not the superseded one", () => {
    expect(at(base(), 4)).toEqual({ id: "loc_new", position: [-97.74, 30.27] });
    expect(at(base(), 5)?.id).toBe("loc_new");
  });
  it("peek across the move follows the same rule, without persisting", () => {
    const { engine } = setup(base());
    expect(currentBase(engine, peek(progress(3)))?.id).toBe("loc_new");
    expect(currentBase(engine, progress(3))?.id).toBe("loc_old");
  });
  it("no team_base claim visible: null", () => {
    expect(at(base(), 0)).toBeNull();
    expect(at(empty(), 3)).toBeNull();
  });
  it("a base without valid coordinates is not a base", () => {
    const d = base();
    d.claims = d.claims.map((c) => (c.id === "c_old" ? ({ ...c, value: "north,west" } as Claim) : c));
    expect(at(d, 3)).toBeNull();
  });
  it("without a current team_base claim after the move: null", () => {
    expect(at(base([], true), 4)?.id).toBe("loc_new");
    const d = base();
    d.claims = d.claims.filter((c) => c.id !== "tb_new");
    expect(at(d, 4)).toBeNull();
  });
});
