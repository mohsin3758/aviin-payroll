import { db } from "@/lib/db";

export type IncentiveEligibleEmploymentType = "permanent" | "contractor";

/**
 * Adds exactly one calendar month, clamping to the last day of the target month if the source
 * day-of-month doesn't exist there (e.g. Jan 31 + 1 month -> Feb 28/29, not Mar 3).
 */
export function addOneCalendarMonth(date: Date): Date {
  const day = date.getDate();
  const result = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  const daysInTargetMonth = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, daysInTargetMonth));
  return result;
}

/**
 * Given a candidate's join date, returns the vesting cutoff date (join date + 1 calendar month)
 * and the {payMonth, payYear} the incentive should be scheduled into — the vesting date's own
 * month/year. Confirmed by the real example: a July 18 join vests Aug 18, and pays in August.
 */
export function computeIncentiveSchedule(joinDate: Date): { eligibleDate: Date; payMonth: number; payYear: number } {
  const eligibleDate = addOneCalendarMonth(joinDate);
  return {
    eligibleDate,
    payMonth: eligibleDate.getMonth() + 1,
    payYear: eligibleDate.getFullYear(),
  };
}

export type VestingOutcome = "still_pending" | "eligible" | "forfeited";

/**
 * Pure decision function: given the vesting cutoff date, the candidate's current dateOfExit (or
 * null), and "now", decides the outcome. Forfeited requires an exit date strictly BEFORE the
 * vesting date — exiting on or after the vesting date still pays out in full.
 */
export function evaluateVesting(eligibleDate: Date, candidateDateOfExit: Date | null, now: Date): VestingOutcome {
  if (candidateDateOfExit && candidateDateOfExit.getTime() < eligibleDate.getTime()) {
    return "forfeited";
  }
  if (now.getTime() < eligibleDate.getTime()) {
    return "still_pending";
  }
  return "eligible";
}

/**
 * Maps Employee.employmentType -> the configured Company rate. Returns null for employment
 * types with no configured incentive (daily_wage/hourly) — the caller must reject these rather
 * than guessing a rate.
 */
export function resolveIncentiveRate(
  employmentType: string,
  rates: { fteRate: number; contractRate: number }
): number | null {
  if (employmentType === "permanent") return rates.fteRate;
  if (employmentType === "contractor") return rates.contractRate;
  return null;
}

/**
 * Re-evaluates every "pending" HiringIncentive against its candidate's current dateOfExit,
 * flipping each to "eligible" or "forfeited" as appropriate. Called before any payroll run
 * consumes incentives and before the admin/HR list view renders, so status is always current —
 * there is no background job in this app, everything is evaluated synchronously on request.
 */
export async function refreshPendingHiringIncentiveVesting(now: Date = new Date()): Promise<void> {
  const pending = await db.hiringIncentive.findMany({
    where: { status: "pending" },
    include: { candidate: { select: { dateOfExit: true } } },
  });

  for (const incentive of pending) {
    const outcome = evaluateVesting(incentive.eligibleDate, incentive.candidate.dateOfExit, now);
    if (outcome === "eligible") {
      await db.hiringIncentive.update({ where: { id: incentive.id }, data: { status: "eligible" } });
    } else if (outcome === "forfeited") {
      await db.hiringIncentive.update({
        where: { id: incentive.id },
        data: { status: "forfeited", forfeitedReason: "Candidate exited before completing 1 month of employment" },
      });
    }
  }
}
