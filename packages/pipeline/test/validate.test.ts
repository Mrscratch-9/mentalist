import { describe, expect, it } from "vitest";
import { formatError } from "../src/errors.ts";
import { validate } from "../src/validate.ts";
import { base, loaded, type Raw } from "./fixture.ts";

const run = (mut: (r: Raw) => void) => {
  const r = base() as unknown as Raw;
  mut(r);
  return validate(loaded(r));
};
const coord = (value: string) => ({ key: "p", subject: "alice", predicate: "coordinates", value, revealed: "S1E1", source: "src1" });

describe("validate", () => {
  it("accepts the minimal fixture", () => {
    expect(validate(loaded(base()))).toEqual([]);
  });

  const cases: Array<[string, (r: Raw) => void, string, string]> = [
    ["duplicate entity key", (r) => r["entities"]!.push({ ...r["entities"]![0] }), "key.duplicate", "entities[4]"],
    ["duplicate claim key", (r) => r["claims"]!.push({ ...r["claims"]![0] }), "key.duplicate", "claims[3]"],
    ["duplicate source key", (r) => r["sources"]!.push({ ...r["sources"]![1] }), "key.duplicate", "sources[2]"],
    ["duplicate episode code", (r) => r["episodes"]!.push({ ...r["episodes"]![0] }), "episode.code_duplicate", "episodes[3].code"],
    ["malformed episode code", (r) => { r["episodes"]![1].code = "ep2"; }, "episode.code_malformed", "episodes[1].code"],
    ["unknown subject", (r) => { r["claims"]![0].subject = "nobody"; }, "ref.unresolved", "claims[0].subject"],
    ["unknown object", (r) => { r["claims"]![1].object = "nobody"; }, "ref.unresolved", "claims[1].object"],
    ["unknown revealed code", (r) => { r["claims"]![0].revealed = "S9E9"; }, "ref.unresolved", "claims[0].revealed"],
    ["unknown introduced code", (r) => { r["entities"]![0].introduced = "S9E9"; }, "ref.unresolved", "entities[0].introduced"],
    ["unknown source", (r) => { r["claims"]![0].source = "nope"; }, "ref.unresolved", "claims[0].source"],
    ["unknown superseded.by", (r) => { r["claims"]![0].superseded = { in: "S2E1", by: "nope" }; }, "ref.unresolved", "claims[0].superseded.by"],
    ["unknown arc item claim", (r) => { r["arcs"]![0].items[0].claim = "nope"; }, "ref.unresolved", "arcs[0].items[0].claim"],
    ["unknown theory spoils_up_to", (r) => { r["theories"]![0].spoils_up_to = "S9E9"; }, "ref.unresolved", "theories[0].spoils_up_to"],
    ["unknown source episode", (r) => { r["sources"]![0].episode = "S9E9"; }, "ref.unresolved", "sources[0].episode"],
    ["episode source without episode", (r) => { delete r["sources"]![0].episode; }, "source.episode_required", "sources[0].episode"],
    ["revealed before subject", (r) => { r["claims"]![1].revealed = "S1E1"; r["entities"]![0].introduced = "S1E2"; }, "claim.revealed_before_subject", "claims[1].revealed"],
    ["revealed before object", (r) => { r["claims"]![1].revealed = "S1E1"; }, "claim.revealed_before_object", "claims[1].revealed"],
    ["superseded not after revealed", (r) => { r["claims"]![0].superseded = { in: "S1E1", by: "c_knows" }; }, "claim.superseded_not_after_reveal", "claims[0].superseded.in"],
    ["source missing", (r) => { delete r["claims"]![0].source; }, "claim.source_missing", "claims[0].source"],
    ["supersede cycle", (r) => {
      r["claims"]![0].superseded = { in: "S1E2", by: "c_knows" };
      r["claims"]![1].superseded = { in: "S2E1", by: "c_name" };
    }, "claim.supersede_cycle", "claims[0].superseded.by"],
    ["arc item before claim", (r) => { r["arcs"]![0].items[0].revealed = "S1E1"; }, "arc.item_before_ref", "arcs[0].items[0].revealed"],
    ["arc item before entity", (r) => { r["arcs"]![0].items[0] = { order: 1, entity: "bob", text: "x", revealed: "S1E1" }; }, "arc.item_before_ref", "arcs[0].items[0].revealed"],
    ["arc entity not an arc", (r) => { r["arcs"]![0].arc = "alice"; }, "arc.not_arc_entity", "arcs[0].arc"],
    ["object and value both set", (r) => { r["claims"]![1].value = "v"; }, "claim.object_value", "claims[1]"],
    ["neither object nor value", (r) => { delete r["claims"]![0].value; }, "claim.object_value", "claims[0]"],
    ["invalid role", (r) => { r["claims"]![2].value = "hero"; }, "claim.role_invalid", "claims[2].value"],
    ["role object not a case", (r) => { r["claims"]![2].object = "bob"; r["claims"]![2].revealed = "S1E2"; }, "claim.role_object_not_case", "claims[2].object"],
    ["coordinates malformed", (r) => r["claims"]!.push(coord("north")), "claim.coordinates_invalid", "claims[3].value"],
    ["coordinates out of range", (r) => r["claims"]!.push(coord("91,10")), "claim.coordinates_invalid", "claims[3].value"],
  ];

  it.each(cases)("%s", (_n, mut, rule, path) => {
    expect(run(mut).map((e) => [e.rule, e.path])).toContainEqual([rule, path]);
  });

  it("accepts valid coordinates", () => {
    expect(run((r) => r["claims"]!.push(coord("-45.5,120")))).toEqual([]);
  });

  it("collects all errors, not just the first", () => {
    const errs = run((r) => {
      r["claims"]![0].subject = "nobody";
      delete r["claims"]![1].source;
      r["claims"]![2].value = "hero";
    });
    expect(errs.map((e) => e.rule).sort()).toEqual(["claim.role_invalid", "claim.source_missing", "ref.unresolved"]);
  });

  it("default messages are spoiler-safe; verbose adds the record key (S5)", () => {
    const errs = run((r) => {
      r["claims"]![0].value = "zqxmark_text";
      r["claims"]![0].subject = "zqxmark_key";
    });
    expect(errs).toHaveLength(1);
    const msg = formatError(errs[0]!);
    expect(msg).toBe("t.yaml: claims[0].subject: ref.unresolved");
    expect(msg).not.toContain("zqxmark");
    expect(formatError(errs[0]!, true)).toContain("zqxmark_key");
  });
});
