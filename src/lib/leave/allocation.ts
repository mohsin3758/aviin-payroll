// Pure helpers for allocating a LeaveBalance row for a given (employee, leaveType, year) —
// extracted so the bulk-allocate route (src/app/api/leave-types/[id]/allocate/route.ts) has a
// single, unit-testable definition of "how much leave does this employee get this year."

export interface LeaveTypePolicy {
  totalDays: number;
  isCarryForward: boolean;
  maxCarryForward: number;
}

export interface PriorYearBalance {
  totalAllocated: number;
  carryForwarded: number;
  used: number;
}

/**
 * Full annual entitlement if the employee joined before the target year, 0 if they join after
 * it (shouldn't normally happen for an active employee, but guarded), otherwise pro-rated by the
 * fraction of the year remaining from (and including) their join date — same ratio-and-round
 * style as salary proration in src/lib/payroll/engine.ts.
 */
export function computeProratedAllocation(totalDays: number, dateOfJoining: Date, year: number): number {
  const joinYear = dateOfJoining.getUTCFullYear();
  if (joinYear < year) return totalDays;
  if (joinYear > year) return 0;

  const daysInYear = Math.round(
    (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86_400_000
  );
  const startOfYear = Date.UTC(year, 0, 1);
  const joinDayUTC = Date.UTC(year, dateOfJoining.getUTCMonth(), dateOfJoining.getUTCDate());
  const dayOfYear = Math.round((joinDayUTC - startOfYear) / 86_400_000) + 1; // 1-indexed, join day counts
  const daysRemaining = daysInYear - dayOfYear + 1;

  return Math.round(totalDays * (daysRemaining / daysInYear));
}

/**
 * How much of the prior year's unused balance carries into this year — 0 if the policy doesn't
 * allow carry-forward or there's no prior-year balance row, otherwise the prior year's unused
 * days capped at the policy's maxCarryForward.
 */
export function computeCarryForward(policy: LeaveTypePolicy, prior: PriorYearBalance | null): number {
  if (!policy.isCarryForward || !prior) return 0;
  const available = Math.max(0, prior.totalAllocated + prior.carryForwarded - prior.used);
  return Math.min(available, policy.maxCarryForward);
}
