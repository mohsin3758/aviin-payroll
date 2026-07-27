import { describe, it, expect } from "vitest";
import { calculateGratuity, GRATUITY_STATUTORY_CAP } from "../gratuity";

describe("calculateGratuity", () => {
  it("is not eligible before 5 years of service", () => {
    const result = calculateGratuity(30000, new Date("2022-01-01"), new Date("2025-06-01"));
    expect(result.eligibleForGratuity).toBe(false);
    expect(result.cappedAmount).toBe(0);
  });

  it("computes the statutory formula for exactly 5 completed years", () => {
    const result = calculateGratuity(30000, new Date("2020-01-01"), new Date("2025-01-01"));
    expect(result.eligibleForGratuity).toBe(true);
    expect(result.completedYears).toBe(5);
    // (15 * 30000 * 5) / 26 = 86538.46 -> rounds to 86538
    expect(result.rawAmount).toBe(86538);
    expect(result.cappedAmount).toBe(86538);
  });

  it("rounds a final partial year up when it exceeds 6 months", () => {
    // ~5 years 7 months of service -> rounds up to 6 completed years
    const result = calculateGratuity(30000, new Date("2019-06-01"), new Date("2025-01-01"));
    expect(result.completedYears).toBe(6);
  });

  it("rounds a final partial year down when it is 6 months or less", () => {
    // ~5 years 3 months of service -> stays at 5 completed years
    const result = calculateGratuity(30000, new Date("2019-10-01"), new Date("2025-01-01"));
    expect(result.completedYears).toBe(5);
  });

  it("caps the payable amount at the statutory ceiling for very high salaries/tenure", () => {
    const result = calculateGratuity(500000, new Date("2000-01-01"), new Date("2026-01-01"));
    expect(result.rawAmount).toBeGreaterThan(GRATUITY_STATUTORY_CAP);
    expect(result.cappedAmount).toBe(GRATUITY_STATUTORY_CAP);
  });
});
