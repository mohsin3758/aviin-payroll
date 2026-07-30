import { describe, it, expect } from "vitest";
import {
  addOneCalendarMonth,
  computeIncentiveSchedule,
  evaluateVesting,
  resolveIncentiveRate,
} from "../hiring-incentive";

describe("addOneCalendarMonth", () => {
  it("adds a normal month", () => {
    const result = addOneCalendarMonth(new Date(2026, 6, 18)); // Jul 18, 2026
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(7); // August (0-indexed)
    expect(result.getDate()).toBe(18);
  });

  it("rolls over the year for a December join", () => {
    const result = addOneCalendarMonth(new Date(2026, 11, 10)); // Dec 10, 2026
    expect(result.getFullYear()).toBe(2027);
    expect(result.getMonth()).toBe(0); // January
    expect(result.getDate()).toBe(10);
  });

  it("clamps to the last day of a shorter target month (Jan 31 -> Feb 28)", () => {
    const result = addOneCalendarMonth(new Date(2026, 0, 31)); // Jan 31, 2026 (not a leap year)
    expect(result.getMonth()).toBe(1); // February
    expect(result.getDate()).toBe(28);
  });

  it("clamps to Feb 29 in a leap year", () => {
    const result = addOneCalendarMonth(new Date(2024, 0, 31)); // Jan 31, 2024 (leap year)
    expect(result.getMonth()).toBe(1);
    expect(result.getDate()).toBe(29);
  });
});

describe("computeIncentiveSchedule", () => {
  it("matches the confirmed example: join Jul 18 -> pays in August", () => {
    const { eligibleDate, payMonth, payYear } = computeIncentiveSchedule(new Date(2026, 6, 18));
    expect(payMonth).toBe(8);
    expect(payYear).toBe(2026);
    expect(eligibleDate.getDate()).toBe(18);
  });

  it("rolls the pay year over for a December join", () => {
    const { payMonth, payYear } = computeIncentiveSchedule(new Date(2026, 11, 5));
    expect(payMonth).toBe(1);
    expect(payYear).toBe(2027);
  });
});

describe("evaluateVesting", () => {
  const eligibleDate = new Date(2026, 7, 18); // Aug 18, 2026

  it("is eligible once 'now' has passed the vesting date and the candidate never exited", () => {
    expect(evaluateVesting(eligibleDate, null, new Date(2026, 7, 19))).toBe("eligible");
  });

  it("is still pending before the vesting date, regardless of exit status", () => {
    expect(evaluateVesting(eligibleDate, null, new Date(2026, 7, 17))).toBe("still_pending");
  });

  it("is forfeited if the candidate exited strictly before the vesting date", () => {
    const exitedEarly = new Date(2026, 7, 10);
    expect(evaluateVesting(eligibleDate, exitedEarly, new Date(2026, 7, 19))).toBe("forfeited");
  });

  it("still pays out if the candidate exits ON the vesting date itself", () => {
    const exitsOnVestingDay = new Date(2026, 7, 18);
    expect(evaluateVesting(eligibleDate, exitsOnVestingDay, new Date(2026, 7, 19))).toBe("eligible");
  });

  it("still pays out if the candidate exits AFTER the vesting date", () => {
    const exitsLater = new Date(2026, 7, 25);
    expect(evaluateVesting(eligibleDate, exitsLater, new Date(2026, 8, 1))).toBe("eligible");
  });
});

describe("resolveIncentiveRate", () => {
  const rates = { fteRate: 5000, contractRate: 2000 };

  it("maps permanent employment to the FTE rate", () => {
    expect(resolveIncentiveRate("permanent", rates)).toBe(5000);
  });

  it("maps contractor employment to the contract rate", () => {
    expect(resolveIncentiveRate("contractor", rates)).toBe(2000);
  });

  it("returns null for daily_wage and hourly (not eligible)", () => {
    expect(resolveIncentiveRate("daily_wage", rates)).toBeNull();
    expect(resolveIncentiveRate("hourly", rates)).toBeNull();
  });
});
