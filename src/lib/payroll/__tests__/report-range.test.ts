import { describe, it, expect } from "vitest";
import { enumerateMonthRange, InvalidRangeError, MAX_RANGE_MONTHS } from "../report-range";

describe("enumerateMonthRange", () => {
  it("returns a single pair when from equals to (single-month equivalent)", () => {
    expect(enumerateMonthRange(6, 2026, 6, 2026)).toEqual([{ month: 6, year: 2026 }]);
  });

  it("enumerates a same-year range inclusive of both ends", () => {
    expect(enumerateMonthRange(1, 2026, 4, 2026)).toEqual([
      { month: 1, year: 2026 },
      { month: 2, year: 2026 },
      { month: 3, year: 2026 },
      { month: 4, year: 2026 },
    ]);
  });

  it("enumerates a cross-year range correctly", () => {
    expect(enumerateMonthRange(11, 2025, 2, 2026)).toEqual([
      { month: 11, year: 2025 },
      { month: 12, year: 2025 },
      { month: 1, year: 2026 },
      { month: 2, year: 2026 },
    ]);
  });

  it("rejects a range where to is before from", () => {
    expect(() => enumerateMonthRange(6, 2026, 1, 2026)).toThrow(InvalidRangeError);
  });

  it("accepts a range exactly at MAX_RANGE_MONTHS (Jan 2026 - Dec 2027 = 24 months)", () => {
    const result = enumerateMonthRange(1, 2026, 12, 2027);
    expect(result.length).toBe(MAX_RANGE_MONTHS);
  });

  it("rejects a range one month over MAX_RANGE_MONTHS (Jan 2026 - Jan 2028 = 25 months)", () => {
    expect(() => enumerateMonthRange(1, 2026, 1, 2028)).toThrow(InvalidRangeError);
  });
});
