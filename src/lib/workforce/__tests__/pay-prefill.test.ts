import { describe, it, expect } from "vitest";
import { computePayPrefill, countWorkingDays } from "../pay-prefill";

const MON_FRI = [1, 2, 3, 4, 5];

describe("countWorkingDays", () => {
  it("counts Mon–Fri days (Nov 2026 has 21)", () => {
    expect(countWorkingDays(2026, 11, MON_FRI)).toBe(21);
  });
  it("subtracts a holiday that falls on a working day", () => {
    expect(countWorkingDays(2026, 11, MON_FRI, [{ year: 2026, month: 11, day: 12 }])).toBe(20); // Thursday
  });
  it("ignores a holiday that falls on a weekly off", () => {
    expect(countWorkingDays(2026, 11, MON_FRI, [{ year: 2026, month: 11, day: 15 }])).toBe(21); // Sunday
  });
  it("ignores holidays from other months", () => {
    expect(countWorkingDays(2026, 11, MON_FRI, [{ year: 2026, month: 12, day: 25 }])).toBe(21);
  });
  it("supports a 6-day working week", () => {
    expect(countWorkingDays(2026, 11, [1, 2, 3, 4, 5, 6])).toBe(25);
  });
});

describe("monthly pay", () => {
  it("full attendance on calendar basis pays the full fee", () => {
    const r = computePayPrefill({ payType: "monthly", payRate: 60000, monthlyDayBasis: "calendar", year: 2026, month: 11, unpaidDays: 0 });
    expect(r).toMatchObject({ ok: true, unitsWorked: 1, rateOverride: 60000, suggestedGross: 60000 });
  });

  it("calendar basis divides by 30 in a 30-day month and 31 in a 31-day month", () => {
    const nov = computePayPrefill({ payType: "monthly", payRate: 30000, monthlyDayBasis: "calendar", year: 2026, month: 11, unpaidDays: 3 });
    expect(nov).toMatchObject({ ok: true, rateOverride: 27000 }); // 30000 × 27/30
    const dec = computePayPrefill({ payType: "monthly", payRate: 31000, monthlyDayBasis: "calendar", year: 2026, month: 12, unpaidDays: 1 });
    expect(dec).toMatchObject({ ok: true, rateOverride: 30000 }); // 31000 × 30/31
  });

  it("working-day basis divides by the client's 20 / 21 / 22 days", () => {
    const expectations: [number, number][] = [[20, 62700], [21, 62857], [22, 63000]];
    for (const [wd, expected] of expectations) {
      const r = computePayPrefill({ payType: "monthly", payRate: 66000, monthlyDayBasis: "working", year: 2026, month: 11, workingDaysInMonth: wd, unpaidDays: 1 });
      expect(r).toMatchObject({ ok: true, rateOverride: expected, unitsWorked: 1 }); // 66000 × (wd-1)/wd
    }
  });

  it("a half-day deduction is 0.5 unpaid day", () => {
    const r = computePayPrefill({ payType: "monthly", payRate: 42000, monthlyDayBasis: "working", year: 2026, month: 11, workingDaysInMonth: 21, unpaidDays: 0.5 });
    expect(r).toMatchObject({ ok: true, rateOverride: 41000 }); // 42000 × 20.5/21
  });

  it("never goes below zero if unpaid days exceed the month", () => {
    const r = computePayPrefill({ payType: "monthly", payRate: 30000, monthlyDayBasis: "working", year: 2026, month: 11, workingDaysInMonth: 21, unpaidDays: 30 });
    expect(r).toMatchObject({ ok: true, rateOverride: 0, suggestedGross: 0 });
  });

  it("working basis without a working-day count is rejected, not guessed", () => {
    expect(computePayPrefill({ payType: "monthly", payRate: 30000, monthlyDayBasis: "working", year: 2026, month: 11 }).ok).toBe(false);
  });

  it("defaults to the working-day basis", () => {
    // Needs workingDaysInMonth, so omitting it fails: proves 'working' is the default basis.
    expect(computePayPrefill({ payType: "monthly", payRate: 30000, year: 2026, month: 11 }).ok).toBe(false);
  });

  it("rejects negative unpaid days", () => {
    expect(computePayPrefill({ payType: "monthly", payRate: 1000, monthlyDayBasis: "calendar", year: 2026, month: 11, unpaidDays: -1 }).ok).toBe(false);
  });
});

describe("daily and hourly pay", () => {
  it("per day = rate × payable days as units", () => {
    expect(computePayPrefill({ payType: "daily", payRate: 2500, year: 2026, month: 11, payableDays: 19.5 })).toMatchObject({
      ok: true, unitsWorked: 19.5, rateOverride: 2500, suggestedGross: 48750,
    });
  });
  it("per hour = rate × approved hours as units", () => {
    expect(computePayPrefill({ payType: "hourly", payRate: 450, year: 2026, month: 11, approvedHours: 160.5 })).toMatchObject({
      ok: true, unitsWorked: 160.5, rateOverride: 450, suggestedGross: 72225,
    });
  });
  it("requires the matching quantity", () => {
    expect(computePayPrefill({ payType: "daily", payRate: 2500, year: 2026, month: 11 }).ok).toBe(false);
    expect(computePayPrefill({ payType: "hourly", payRate: 450, year: 2026, month: 11 }).ok).toBe(false);
  });
});

describe("missing / invalid rate", () => {
  it("is a payroll problem, never silently zero", () => {
    for (const payRate of [null, 0, -5]) {
      expect(computePayPrefill({ payType: "monthly", payRate, monthlyDayBasis: "calendar", year: 2026, month: 11 }).ok).toBe(false);
    }
  });
  it("rejects an unknown pay type", () => {
    // @ts-expect-error deliberately invalid
    expect(computePayPrefill({ payType: "weekly", payRate: 100, year: 2026, month: 11 }).ok).toBe(false);
  });
});
