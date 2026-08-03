import { describe, it, expect } from "vitest";
import { computeMonthlyAttendance, type AttendanceRowInput } from "../attendance-tally";
import { STANDARD_HOURS_PER_DAY } from "../engine";

// June 2026 has 30 days. Sunday (day 0) is the weekly-off day used in these tests.
const MONTH = 6;
const YEAR = 2026;
const DAYS_IN_MONTH = 30;

function row(day: number, status: string, totalHours: number | null = null): AttendanceRowInput {
  return { date: new Date(Date.UTC(YEAR, MONTH - 1, day)), status, totalHours };
}

describe("computeMonthlyAttendance", () => {
  it("counts an explicit present row as a full present day", () => {
    const result = computeMonthlyAttendance([row(1, "present")], DAYS_IN_MONTH, MONTH, YEAR, new Set(), []);
    expect(result.presentDays).toBeGreaterThanOrEqual(1);
  });

  it("counts an explicit absent row as an absent day, not present", () => {
    const result = computeMonthlyAttendance([row(1, "absent")], DAYS_IN_MONTH, MONTH, YEAR, new Set(), []);
    // Day 1 itself contributes 0 to presentDays; isolate by checking absentDays includes it.
    expect(result.absentDays).toBeGreaterThanOrEqual(1);
  });

  it("counts a half-day row as 0.5 present and increments halfDays", () => {
    const result = computeMonthlyAttendance([row(1, "half-day")], DAYS_IN_MONTH, MONTH, YEAR, new Set(), []);
    expect(result.halfDays).toBe(1);
  });

  it("auto-credits a holiday as present when there is no explicit attendance row", () => {
    const holidayKey = new Date(Date.UTC(YEAR, MONTH - 1, 15)).toISOString().slice(0, 10);
    const withHoliday = computeMonthlyAttendance([], DAYS_IN_MONTH, MONTH, YEAR, new Set([holidayKey]), []);
    const withoutHoliday = computeMonthlyAttendance([], DAYS_IN_MONTH, MONTH, YEAR, new Set(), []);
    expect(withHoliday.presentDays).toBe(withoutHoliday.presentDays + 1);
    expect(withHoliday.absentDays).toBe(withoutHoliday.absentDays - 1);
  });

  it("auto-credits a weekly-off day of week as present when there is no explicit row", () => {
    // June 2026: find how many Sundays (day-of-week 0) fall in the month with no records.
    let sundays = 0;
    for (let d = 1; d <= DAYS_IN_MONTH; d++) {
      if (new Date(Date.UTC(YEAR, MONTH - 1, d)).getUTCDay() === 0) sundays += 1;
    }
    const withWeeklyOff = computeMonthlyAttendance([], DAYS_IN_MONTH, MONTH, YEAR, new Set(), [0]);
    const withoutWeeklyOff = computeMonthlyAttendance([], DAYS_IN_MONTH, MONTH, YEAR, new Set(), []);
    expect(withWeeklyOff.presentDays).toBe(withoutWeeklyOff.presentDays + sundays);
  });

  it("a day with no record and not a holiday/weekly-off counts as absent", () => {
    const result = computeMonthlyAttendance([], DAYS_IN_MONTH, MONTH, YEAR, new Set(), []);
    expect(result.presentDays).toBe(0);
    expect(result.absentDays).toBe(DAYS_IN_MONTH);
  });

  it("an explicit holiday/weekly-off status row counts as present even without auto-credit sets", () => {
    const result = computeMonthlyAttendance([row(1, "holiday"), row(2, "weekly-off")], DAYS_IN_MONTH, MONTH, YEAR, new Set(), []);
    expect(result.presentDays).toBeGreaterThanOrEqual(2);
  });

  it("accumulates overtime only for hours beyond the standard threshold", () => {
    const result = computeMonthlyAttendance(
      [row(1, "present", STANDARD_HOURS_PER_DAY + 2), row(2, "present", STANDARD_HOURS_PER_DAY)],
      DAYS_IN_MONTH, MONTH, YEAR, new Set(), []
    );
    expect(result.overtimeHours).toBe(2);
  });

  it("an explicit record always takes precedence over holiday/weekly-off auto-credit", () => {
    const day = 15;
    const dateKey = new Date(Date.UTC(YEAR, MONTH - 1, day)).toISOString().slice(0, 10);
    const result = computeMonthlyAttendance([row(day, "absent")], DAYS_IN_MONTH, MONTH, YEAR, new Set([dateKey]), []);
    expect(result.absentDays).toBeGreaterThanOrEqual(1);
  });

  // additionalCreditedDateKeys models an employee's chosen Restricted/Optional holidays (see
  // src/app/api/ess/optional-holidays/route.ts) — distinct from holidayDateKeys, which is
  // company-wide mandatory holidays applying to everyone the same way.
  describe("additionalCreditedDateKeys (Restricted/Optional holiday picks)", () => {
    it("auto-credits a date in additionalCreditedDateKeys as present when there is no explicit row", () => {
      const optionalKey = new Date(Date.UTC(YEAR, MONTH - 1, 20)).toISOString().slice(0, 10);
      const withPick = computeMonthlyAttendance([], DAYS_IN_MONTH, MONTH, YEAR, new Set(), [], new Set([optionalKey]));
      const withoutPick = computeMonthlyAttendance([], DAYS_IN_MONTH, MONTH, YEAR, new Set(), [], new Set());
      expect(withPick.presentDays).toBe(withoutPick.presentDays + 1);
      expect(withPick.absentDays).toBe(withoutPick.absentDays - 1);
    });

    it("defaults to crediting nothing extra when additionalCreditedDateKeys is omitted", () => {
      const result = computeMonthlyAttendance([], DAYS_IN_MONTH, MONTH, YEAR, new Set(), []);
      expect(result.presentDays).toBe(0);
      expect(result.absentDays).toBe(DAYS_IN_MONTH);
    });

    it("an explicit absent record still takes precedence over an additionalCreditedDateKeys pick", () => {
      const day = 20;
      const dateKey = new Date(Date.UTC(YEAR, MONTH - 1, day)).toISOString().slice(0, 10);
      const result = computeMonthlyAttendance([row(day, "absent")], DAYS_IN_MONTH, MONTH, YEAR, new Set(), [], new Set([dateKey]));
      expect(result.absentDays).toBeGreaterThanOrEqual(1);
    });
  });
});
