import { getDaysInMonth } from "@/lib/payroll/engine";

/**
 * Turns an assignment's pay terms + approved attendance into a SUGGESTED entry for the existing
 * Alternate Pay run (POST /api/payroll/alternate-pay takes `unitsWorked` + `rateOverride`).
 * This computes a proposal for an admin to review and submit; it never calls payroll and never
 * decides anything on its own. The existing engine still does the real calculation and TDS.
 *
 * Every pay type is expressed the way the engine understands it — rate × units — so it works for
 * Employee.employmentType "contractor" (rate × units, minus TDS) as well as "daily_wage"/"hourly":
 *   monthly -> units 1,                rate = prorated monthly fee
 *   daily   -> units = payable days,   rate = day rate
 *   hourly  -> units = approved hours, rate = hourly rate
 */
export type PayType = "monthly" | "daily" | "hourly";
export type MonthlyDayBasis = "calendar" | "working";

export interface PrefillInput {
  payType: PayType;
  payRate: number | null;
  /** monthly only. Defaults to "working". */
  monthlyDayBasis?: MonthlyDayBasis;
  year: number;
  /** 1-12 */
  month: number;
  /** monthly + "working" basis: the client's working days in the month (see countWorkingDays). */
  workingDaysInMonth?: number;
  /** monthly: admin-confirmed unpaid days (absences, unpaid leave, 0.5 per half-day). */
  unpaidDays?: number;
  /** daily: days actually worked only (owner decision) — weekly offs, holidays and leave are not paid. Half-day = 0.5. */
  payableDays?: number;
  /** hourly: approved payable hours (overtime already filtered by the client's OT policy). */
  approvedHours?: number;
}

export type PrefillResult =
  | {
      ok: true;
      unitsWorked: number;
      rateOverride: number;
      suggestedGross: number;
      /** Human-readable working of how the figure was reached, shown to the admin. */
      basisNote: string;
    }
  | { ok: false; reason: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computePayPrefill(input: PrefillInput): PrefillResult {
  const { payType, payRate } = input;
  if (payRate == null || !(payRate > 0)) {
    return { ok: false, reason: "No valid pay rate on the assignment — set it before payroll pre-fill." };
  }

  if (payType === "monthly") {
    const basis = input.monthlyDayBasis ?? "working";
    const divisor = basis === "calendar" ? getDaysInMonth(input.month, input.year) : input.workingDaysInMonth;
    if (divisor == null || !(divisor > 0)) {
      return { ok: false, reason: "Working days in the month are required for the 'working days' monthly basis." };
    }
    const unpaid = input.unpaidDays ?? 0;
    if (unpaid < 0) return { ok: false, reason: "Unpaid days cannot be negative." };
    const payableDays = Math.max(0, divisor - unpaid); // never below zero if unpaid exceeds the month
    const amount = Math.round((payRate * payableDays) / divisor);
    return {
      ok: true,
      unitsWorked: 1,
      rateOverride: amount,
      suggestedGross: amount,
      basisNote: `Monthly fee ${payRate} × ${round2(payableDays)}/${divisor} ${basis} days (${round2(Math.min(unpaid, divisor))} unpaid)`,
    };
  }

  if (payType === "daily") {
    const days = input.payableDays;
    if (days == null || days < 0) return { ok: false, reason: "Payable days are required for a per-day assignment." };
    return {
      ok: true,
      unitsWorked: round2(days),
      rateOverride: payRate,
      suggestedGross: Math.round(payRate * days),
      basisNote: `${payRate} per day × ${round2(days)} payable days`,
    };
  }

  if (payType === "hourly") {
    const hours = input.approvedHours;
    if (hours == null || hours < 0) return { ok: false, reason: "Approved hours are required for a per-hour assignment." };
    return {
      ok: true,
      unitsWorked: round2(hours),
      rateOverride: payRate,
      suggestedGross: Math.round(payRate * hours),
      basisNote: `${payRate} per hour × ${round2(hours)} approved hours`,
    };
  }

  return { ok: false, reason: `Unknown pay type "${payType}".` };
}

/**
 * Number of working days in a month for a client: days whose weekday is in `workingWeekdays`
 * (0=Sunday..6=Saturday), minus any listed holidays that fall on such a day. Gives the 20/21/22
 * figure for the "working days" monthly basis. Pure UTC date math, so it is timezone-independent.
 */
export function countWorkingDays(
  year: number,
  month: number,
  workingWeekdays: number[],
  holidays: { year: number; month: number; day: number }[] = []
): number {
  const total = getDaysInMonth(month, year);
  const holidayDays = new Set(holidays.filter((h) => h.year === year && h.month === month).map((h) => h.day));
  let count = 0;
  for (let day = 1; day <= total; day++) {
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (workingWeekdays.includes(weekday) && !holidayDays.has(day)) count++;
  }
  return count;
}
