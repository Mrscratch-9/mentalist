import { describe, expect, it } from "vitest";
import { moveIndex, pickerModel } from "./navigation";

const groups = [
  { season: 1, episodes: [
    { watched: true, season: 1, number: 1, title: "Pilot", synopsis: "" },
    { watched: true, season: 1, number: 2, title: "Red Hair and Silver Tape", synopsis: "" },
  ] },
  { season: 2, episodes: [{ watched: false, season: 2, number: 1, title: "Redemption", synopsis: "" }] },
];

describe("pickerModel", () => {
  it("lists the seasons and each season's episodes with their (translated) title", () => {
    const m = pickerModel(groups);
    expect(m.seasons).toEqual([1, 2]);
    expect(m.episodes(1)).toEqual([
      { value: "1", label: "1 · Pilot" },
      { value: "2", label: "2 · Red Hair and Silver Tape" },
    ]);
    expect(m.episodes(2)).toEqual([{ value: "1", label: "1 · Redemption" }]);
  });
  it("gives no episodes for an unknown season", () => {
    expect(pickerModel(groups).episodes(9)).toEqual([]);
    expect(pickerModel([]).seasons).toEqual([]);
  });
});

describe("moveIndex", () => {
  it("moves with arrows, clamped at both ends", () => {
    expect(moveIndex("ArrowDown", 0, 3)).toBe(1);
    expect(moveIndex("ArrowDown", 2, 3)).toBe(2);
    expect(moveIndex("ArrowUp", 2, 3)).toBe(1);
    expect(moveIndex("ArrowUp", 0, 3)).toBe(0);
    expect(moveIndex("ArrowRight", 0, 3)).toBe(1);
    expect(moveIndex("ArrowLeft", 1, 3)).toBe(0);
  });
  it("jumps with Home and End", () => {
    expect(moveIndex("Home", 2, 5)).toBe(0);
    expect(moveIndex("End", 0, 5)).toBe(4);
  });
  it("ignores other keys (Enter, Tab) and empty lists", () => {
    expect(moveIndex("Enter", 1, 3)).toBeNull();
    expect(moveIndex("Tab", 1, 3)).toBeNull();
    expect(moveIndex("ArrowDown", 0, 0)).toBeNull();
  });
});
