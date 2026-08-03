import { describe, it, expect } from "vitest";
import { computeProratedAllocation, computeCarryForward } from "../allocation";

describe("computeProratedAllocation", () => {
  it("grants the full annual entitlement when the employee joined before the target year", () => {
    const result = computeProratedAllocation(15, new Date(Date.UTC(2020, 0, 1)), 2026);
    expect(result).toBe(15);
  });

  it("grants 0 when the employee joins after the target year", () => {
    const result = computeProratedAllocation(15, new Date(Date.UTC(2027, 0, 1)), 2026);
    expect(result).toBe(0);
  });

  it("pro-rates when the employee joined on Jan 1 of the target year (full year remaining)", () => {
    const result = computeProratedAllocation(15, new Date(Date.UTC(2026, 0, 1)), 2026);
    expect(result).toBe(15);
  });

  it("pro-rates roughly to half when the employee joined mid-year", () => {
    // 2026 is not a leap year (365 days). Joining Jul 2 leaves 183 of 365 days.
    const result = computeProratedAllocation(15, new Date(Date.UTC(2026, 6, 2)), 2026);
    expect(result).toBe(Math.round(15 * (183 / 365)));
    expect(result).toBeGreaterThan(6);
    expect(result).toBeLessThan(9);
  });

  it("grants 0 when the employee joins on Dec 31 (only 1 day remaining, rounds down for a small quota)", () => {
    const result = computeProratedAllocation(5, new Date(Date.UTC(2026, 11, 31)), 2026);
    expect(result).toBe(Math.round(5 * (1 / 365)));
    expect(result).toBe(0);
  });

  it("correctly uses 366 days for a leap year", () => {
    // 2028 is a leap year. Joining Jan 1 should still yield the full entitlement.
    const result = computeProratedAllocation(12, new Date(Date.UTC(2028, 0, 1)), 2028);
    expect(result).toBe(12);
  });
});

describe("computeCarryForward", () => {
  const policy = { totalDays: 15, isCarryForward: true, maxCarryForward: 7 };

  it("returns 0 when the policy doesn't allow carry-forward, even with a prior balance", () => {
    const result = computeCarryForward(
      { ...policy, isCarryForward: false },
      { totalAllocated: 15, carryForwarded: 0, used: 5 }
    );
    expect(result).toBe(0);
  });

  it("returns 0 when there is no prior-year balance", () => {
    expect(computeCarryForward(policy, null)).toBe(0);
  });

  it("carries forward the prior year's unused days when under the cap", () => {
    // available = 15 + 0 - 12 = 3, under maxCarryForward of 7
    const result = computeCarryForward(policy, { totalAllocated: 15, carryForwarded: 0, used: 12 });
    expect(result).toBe(3);
  });

  it("caps carry-forward at maxCarryForward even when more is available", () => {
    // available = 15 + 0 - 2 = 13, capped at 7
    const result = computeCarryForward(policy, { totalAllocated: 15, carryForwarded: 0, used: 2 });
    expect(result).toBe(7);
  });

  it("never goes negative when prior usage exceeded the allocation", () => {
    // available would be 15 - 20 = -5, clamped to 0
    const result = computeCarryForward(policy, { totalAllocated: 15, carryForwarded: 0, used: 20 });
    expect(result).toBe(0);
  });
});
