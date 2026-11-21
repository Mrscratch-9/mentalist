import { entityId, claimId, theoryId, type Dataset } from "../src/index.ts";
import { clm, ent } from "./helpers.ts";

/**
 * Small synthetic world (invented names, S6). 6 episodes: S1E1-E3 = ep 1-3, S2E1-E3 = ep 4-6.
 * Opaque, meaningless IDs.
 */
export const ID = {
  orla: "e_k3x9", bram: "e_q7m2", dara: "e_t5v1",
  hall: "e_h8a4", dock: "e_d2c6", case1: "e_c9z0", arc1: "e_r4n8", org: "e_o1w5",
};

export function tiny(): Dataset {
  return {
    episodes: [1, 2, 3, 4, 5, 6].map((n) => ({
      epIndex: n, season: n <= 3 ? 1 : 2, number: n <= 3 ? n : n - 3,
      title: `Title ${n}`, synopsis: `Synopsis ${n}`, details: `Details ${n}`,
    })),
    entities: [
      ent(ID.orla, "person", 1), ent(ID.dara, "person", 2), ent(ID.bram, "person", 4),
      ent(ID.hall, "location", 1), ent(ID.dock, "location", 5),
      ent(ID.case1, "case", 2), ent(ID.arc1, "arc", 1), ent(ID.org, "organization", 5),
    ],
    claims: [
      clm("c_name_orla", ID.orla, "name", 1, { value: "Orla Vint" }),
      clm("c_alias_orla", ID.orla, "alias", 4, { value: "Vintner" }),
      clm("c_name_bram", ID.bram, "name", 4, { value: "Bram Teller" }),
      clm("c_susp", ID.dara, "trait", 2, {
        value: "Dara hides a lantern", status: "in_show_suspicion", supIn: 4, supBy: "c_truth",
      }),
      clm("c_truth", ID.dara, "trait", 4, { value: "Dara never owned a lantern" }),
      clm("c_knows_1", ID.orla, "knows", 2, { object: ID.dara }),
      clm("c_knows_2", ID.orla, "knows", 4, { object: ID.bram }),
      clm("c_hall_pos", ID.hall, "coordinates", 1, { value: "10.5,20.5" }),
      clm("c_dock_pos", ID.dock, "coordinates", 5, { value: "11.5,21.5" }),
      clm("c_role_dara", ID.dara, "role_in_case", 2, { object: ID.case1, value: "victim" }),
      clm("c_role_orla_s", ID.orla, "role_in_case", 2, {
        object: ID.case1, value: "suspect", status: "in_show_suspicion", supIn: 5, supBy: "c_role_orla_p",
      }),
      clm("c_role_orla_p", ID.orla, "role_in_case", 5, { object: ID.case1, value: "perpetrator" }),
      clm("c_fut_org", ID.org, "name", 5, { value: "Zorvane Circle" }),
      // Violates the build-time rule on purpose: revealed before its subject exists.
      clm("c_early", ID.bram, "note", 3, { value: "premature zorvane rumour" }),
    ],
    arcItems: [
      { arc: entityId(ID.arc1), order: 10, refClaim: claimId("c_name_orla"), refEntity: null, narrativeText: "First step", revealedIn: 1 },
      { arc: entityId(ID.arc1), order: 20, refClaim: claimId("c_role_orla_p"), refEntity: null, narrativeText: "Hidden step", revealedIn: 5 },
      { arc: entityId(ID.arc1), order: 30, refClaim: null, refEntity: entityId(ID.hall), narrativeText: "Third step", revealedIn: 2 },
    ],
    theories: [
      { id: theoryId("t_a1"), title: "Early theory", body: "about ep two", sourceUrl: "https://example.invalid/a", authorHandle: "fan_one", spoilsUpTo: 2, tags: ["people"] },
      { id: theoryId("t_b2"), title: "Late theory", body: "about ep six", sourceUrl: "https://example.invalid/b", authorHandle: null, spoilsUpTo: 6, tags: ["people", "places"] },
    ],
  };
}
