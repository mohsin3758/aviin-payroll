import { describe, it, expect } from "vitest";
import { rangesOverlap, findExclusivityConflicts, activationProblems } from "../assignment-rules";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("rangesOverlap", () => {
  it("detects overlap and touching boundaries", () => {
    expect(rangesOverlap({ start: d("2026-01-01"), end: d("2026-03-31") }, { start: d("2026-03-31"), end: d("2026-06-30") })).toBe(true);
    expect(rangesOverlap({ start: d("2026-01-01"), end: d("2026-03-30") }, { start: d("2026-03-31"), end: d("2026-06-30") })).toBe(false);
  });
  it("treats a null end as open-ended", () => {
    expect(rangesOverlap({ start: d("2026-01-01"), end: null }, { start: d("2030-01-01"), end: d("2030-02-01") })).toBe(true);
    expect(rangesOverlap({ start: d("2026-05-01"), end: d("2026-06-01") }, { start: d("2026-01-01"), end: d("2026-04-30") })).toBe(false);
  });
});

describe("findExclusivityConflicts", () => {
  const existing = [
    { id: "a1", status: "active", contractType: "exclusive", start: d("2026-01-01"), end: null },
    { id: "a2", status: "ended", contractType: "exclusive", start: d("2025-01-01"), end: d("2025-12-31") },
    { id: "a3", status: "planned", contractType: "non_exclusive", start: d("2026-01-01"), end: d("2026-12-31") },
  ];

  it("flags an overlap with an exclusive assignment", () => {
    const r = findExclusivityConflicts({ contractType: "non_exclusive", start: d("2026-06-01"), end: d("2026-09-01") }, existing);
    expect(r.map((x) => x.id)).toEqual(["a1"]);
  });
  it("a new exclusive assignment conflicts with any overlapping live one", () => {
    const r = findExclusivityConflicts({ contractType: "exclusive", start: d("2026-06-01"), end: d("2026-09-01") }, existing);
    expect(r.map((x) => x.id).sort()).toEqual(["a1", "a3"]);
  });
  it("ignores ended assignments and non-overlapping dates", () => {
    const r = findExclusivityConflicts({ contractType: "exclusive", start: d("2025-06-01"), end: d("2025-09-01") }, existing);
    expect(r).toEqual([]);
  });
  it("two non-exclusive assignments never conflict", () => {
    const r = findExclusivityConflicts(
      { contractType: "non_exclusive", start: d("2026-06-01"), end: null },
      [{ id: "n1", status: "active", contractType: "non_exclusive", start: d("2026-01-01"), end: null }]
    );
    expect(r).toEqual([]);
  });
  it("does not conflict with itself when updating", () => {
    const r = findExclusivityConflicts({ id: "a1", contractType: "exclusive", start: d("2026-01-01"), end: null }, [existing[0]]);
    expect(r).toEqual([]);
  });
});

describe("activationProblems", () => {
  it("requires a pay rate to go active", () => {
    expect(activationProblems({ status: "active", payRate: null })).toHaveLength(1);
    expect(activationProblems({ status: "active", payRate: 0 })).toHaveLength(1);
    expect(activationProblems({ status: "active", payRate: 50000 })).toEqual([]);
  });
  it("does not require it for planned/paused/ended", () => {
    expect(activationProblems({ status: "planned", payRate: null })).toEqual([]);
    expect(activationProblems({ status: "ended", payRate: null })).toEqual([]);
  });
});
