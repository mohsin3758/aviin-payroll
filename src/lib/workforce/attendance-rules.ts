import { timeToMinutes, type WorkforceSettings } from "@/lib/workforce/settings";

/**
 * The attendance rules for one contractor-day, as a PURE function of facts + settings
 * (docs/CONTRACTOR_MONITORING_SPEC.md §5, §7). It decides a day's state and the hours/overtime
 * figures. It never changes pay: unpaid fractions and payable hours are inputs to a SUGGESTION
 * that an admin confirms (see pay-prefill.ts).
 *
 * Known limit: a shift is assumed to start and end on the same local calendar day (no night shifts).
 */
export type DayState = "pending" | "present" | "late" | "half_day" | "absent" | "leave" | "holiday" | "weekly_off";

export type DayFlag =
  | "missing_checkout" // day closed with a check-in but no hours known
  | "short_hours" // present/late but worked less than the scheduled day beyond tolerance
  | "overtime_pending_approval" // client_approved policy and the client hasn't approved all overtime
  | "overtime_unpaid_by_policy" // overtime recorded but this client's policy doesn't pay it
  | "worked_on_non_working_day"; // checked in on a holiday, weekly off or leave day

export interface DayInput {
  settings: WorkforceSettings;
  /** Minutes the local timezone is ahead of UTC (IST = 330). */
  tzOffsetMinutes: number;
  /** True once the day is over and the coordinator has cleared it; hours/pulse rules only apply then. */
  dayClosed: boolean;
  isHoliday: boolean;
  isWeeklyOff: boolean;
  leave: "none" | "paid" | "unpaid";
  checkInAt: Date | null;
  /** Hours worked, already computed by the caller (check-in to check-out when breaksIncluded). Null = unknown. */
  hoursWorked: number | null;
  pulsesSent: number;
  pulsesAnswered: number;
  /** Unanswered pulses the contractor gave a valid reason for (leave, break); they don't count as missed. */
  pulsesExcused?: number;
  /** Overtime hours the client has approved (only used by the "client_approved" policy). */
  approvedOvertimeHours?: number;
}

export interface DayResult {
  state: DayState;
  lateMinutes: number;
  hoursWorked: number | null;
  regularHours: number;
  /** All hours beyond the overtime threshold, paid or not. */
  overtimeHours: number;
  /** Overtime that this client's policy actually pays. */
  payableOvertimeHours: number;
  /** Hours to pay on per-hour deals: regular + payable overtime, capped by maxPayableHoursPerDay. */
  payableHours: number;
  /** Share of this day suggested unpaid on monthly-fee deals (absent 1, half-day 0.5, unpaid leave 1). */
  unpaidFraction: number;
  /** Share of this day that counts as "days worked" on per-day deals (present/late 1, half-day 0.5). */
  workedFraction: number;
  flags: DayFlag[];
  /** Plain-language reasons shown to coordinators, clients and the contractor. */
  reasons: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Minutes since local midnight for an instant, in a timezone given as a fixed offset from UTC. */
export function localMinutesOfDay(at: Date, tzOffsetMinutes: number): number {
  const local = Math.floor(at.getTime() / 60000) + tzOffsetMinutes;
  return ((local % 1440) + 1440) % 1440;
}

/** Check-in to check-out in hours, or null if either is missing or the order is impossible. */
export function spanHours(checkInAt: Date | null, checkOutAt: Date | null): number | null {
  if (!checkInAt || !checkOutAt) return null;
  const ms = checkOutAt.getTime() - checkInAt.getTime();
  return ms >= 0 ? round2(ms / 3_600_000) : null;
}

function overtimeFigures(hours: number | null, s: WorkforceSettings, approved: number | undefined) {
  if (hours == null) {
    return { regularHours: 0, overtimeHours: 0, payableOvertimeHours: 0, payableHours: 0, flags: [] as DayFlag[] };
  }
  const regularHours = Math.min(hours, s.overtimeStartsAfterHours);
  const overtimeHours = Math.max(0, hours - s.overtimeStartsAfterHours);
  let payableOvertimeHours = 0;
  const flags: DayFlag[] = [];
  if (overtimeHours > 0) {
    if (s.overtimePolicy === "auto") payableOvertimeHours = overtimeHours;
    else if (s.overtimePolicy === "client_approved") {
      payableOvertimeHours = Math.min(overtimeHours, Math.max(0, approved ?? 0));
      if (payableOvertimeHours < overtimeHours) flags.push("overtime_pending_approval");
    } else flags.push("overtime_unpaid_by_policy");
  }
  let payableHours = regularHours + payableOvertimeHours;
  if (s.maxPayableHoursPerDay != null) payableHours = Math.min(payableHours, s.maxPayableHoursPerDay);
  return {
    regularHours: round2(regularHours),
    overtimeHours: round2(overtimeHours),
    payableOvertimeHours: round2(payableOvertimeHours),
    payableHours: round2(payableHours),
    flags,
  };
}

export function evaluateDay(input: DayInput): DayResult {
  const { settings: s } = input;
  const reasons: string[] = [];
  const flags: DayFlag[] = [];
  const nonWorking = input.isHoliday || input.isWeeklyOff || input.leave !== "none";

  const base = (state: DayState, extra: Partial<DayResult> = {}): DayResult => ({
    state,
    lateMinutes: 0,
    hoursWorked: input.hoursWorked,
    regularHours: 0,
    overtimeHours: 0,
    payableOvertimeHours: 0,
    payableHours: 0,
    unpaidFraction: 0,
    workedFraction: 0,
    flags,
    reasons,
    ...extra,
  });

  // A non-working day with no check-in is simply that day. (Paid on monthly deals; on per-day
  // deals only days worked are paid, so it earns nothing, which is the owner's rule.)
  if (!input.checkInAt && nonWorking) {
    if (input.isHoliday) { reasons.push("Holiday."); return base("holiday"); }
    if (input.isWeeklyOff) { reasons.push("Weekly off."); return base("weekly_off"); }
    reasons.push(input.leave === "paid" ? "Approved paid leave." : "Approved unpaid leave.");
    return base("leave", { unpaidFraction: input.leave === "unpaid" ? 1 : 0 });
  }

  if (!input.checkInAt) {
    if (!input.dayClosed) { reasons.push("No check-in yet."); return base("pending"); }
    reasons.push("No check-in and no valid reason recorded.");
    return base("absent", { unpaidFraction: 1 });
  }

  // They actually checked in, so evaluate as a normal working day, but flag it for a human if the
  // day was meant to be off.
  if (nonWorking) {
    flags.push("worked_on_non_working_day");
    reasons.push("Worked on a holiday, weekly off or leave day: coordinator to review.");
  }

  const startMin = timeToMinutes(s.shiftStart);
  const lateMinutes = Math.max(0, localMinutesOfDay(input.checkInAt, input.tzOffsetMinutes) - startMin);
  const hours = input.hoursWorked;
  const hoursKnown = input.dayClosed && hours != null;
  const missedPulses = Math.max(0, input.pulsesSent - input.pulsesAnswered - (input.pulsesExcused ?? 0));

  if (input.dayClosed && hours == null) {
    flags.push("missing_checkout");
    reasons.push("Checked in but no check-out or hours were recorded.");
  }

  let state: DayState = "present";
  const lateByMinutes = lateMinutes > s.graceMinutes;
  if (lateByMinutes) {
    state = "late";
    reasons.push(`Checked in ${lateMinutes} min after shift start (grace is ${s.graceMinutes} min).`);
  }

  const halfReasons: string[] = [];
  if (lateMinutes > s.halfDayAfterMinutes) halfReasons.push(`checked in more than ${s.halfDayAfterMinutes} min late`);
  if (hoursKnown && hours! < s.scheduledHoursPerDay * s.halfDayHoursRatio) {
    halfReasons.push(`worked ${round2(hours!)} h, under ${round2(s.scheduledHoursPerDay * s.halfDayHoursRatio)} h`);
  }
  if (input.dayClosed && input.pulsesSent >= s.pulseMissLimit && missedPulses >= s.pulseMissLimit) {
    halfReasons.push(`missed ${missedPulses} of ${input.pulsesSent} "still online" checks without a reason`);
  }
  if (halfReasons.length > 0) {
    state = "half_day";
    reasons.push(`Half-day: ${halfReasons.join("; ")}.`);
  }

  const absentReasons: string[] = [];
  if (lateMinutes > (s.scheduledHoursPerDay * 60) / 2) absentReasons.push("checked in after more than half the shift had passed");
  if (hoursKnown && hours! < s.absentBelowHours) absentReasons.push(`worked only ${round2(hours!)} h (under ${s.absentBelowHours} h)`);
  if (absentReasons.length > 0) {
    state = "absent";
    reasons.push(`Absent: ${absentReasons.join("; ")}.`);
  }

  if (state === "present") reasons.push("Checked in on time.");

  if ((state === "present" || state === "late") && hoursKnown && hours! < s.scheduledHoursPerDay - s.shortHoursToleranceMinutes / 60) {
    flags.push("short_hours");
    reasons.push(`Short hours: worked ${round2(hours!)} h of ${s.scheduledHoursPerDay} h (review; pay is not changed automatically).`);
  }

  const ot = input.dayClosed
    ? overtimeFigures(hours, s, input.approvedOvertimeHours)
    : { regularHours: 0, overtimeHours: 0, payableOvertimeHours: 0, payableHours: 0, flags: [] as DayFlag[] };
  flags.push(...ot.flags);
  if (ot.overtimeHours > 0) {
    reasons.push(
      ot.flags.includes("overtime_unpaid_by_policy")
        ? `Overtime ${ot.overtimeHours} h recorded; not paid under this client's policy.`
        : ot.flags.includes("overtime_pending_approval")
          ? `Overtime ${ot.overtimeHours} h: ${ot.payableOvertimeHours} h approved, the rest awaiting client approval.`
          : `Overtime ${ot.overtimeHours} h payable.`
    );
  }

  return {
    state,
    lateMinutes,
    hoursWorked: hours,
    regularHours: ot.regularHours,
    overtimeHours: ot.overtimeHours,
    payableOvertimeHours: ot.payableOvertimeHours,
    payableHours: ot.payableHours,
    unpaidFraction: state === "absent" ? 1 : state === "half_day" ? 0.5 : 0,
    workedFraction: state === "absent" ? 0 : state === "half_day" ? 0.5 : 1,
    flags,
    reasons,
  };
}

export interface MonthSummary {
  counts: Record<DayState, number>;
  /** Per-day deals: days actually worked (half-day = 0.5). */
  workedDays: number;
  /** Monthly-fee deals: suggested unpaid days (absent 1, half-day 0.5, unpaid leave 1). Admin confirms. */
  suggestedUnpaidDays: number;
  /** Per-hour deals: sum of payable hours. */
  payableHours: number;
  overtimeHours: number;
  payableOvertimeHours: number;
  lateDays: number;
  /** lateDays reached the review threshold: opens a coordinator task, never a deduction. */
  needsLateReview: boolean;
  /** Days still undecided; the month can only lock when this is 0. */
  pendingDays: number;
  flagCounts: Partial<Record<DayFlag, number>>;
}

export function summarizeMonth(days: DayResult[], settings: Pick<WorkforceSettings, "lateReviewCount">): MonthSummary {
  const counts: Record<DayState, number> = {
    pending: 0, present: 0, late: 0, half_day: 0, absent: 0, leave: 0, holiday: 0, weekly_off: 0,
  };
  const flagCounts: Partial<Record<DayFlag, number>> = {};
  let workedDays = 0, unpaid = 0, payable = 0, ot = 0, payableOt = 0;
  for (const d of days) {
    counts[d.state]++;
    workedDays += d.workedFraction;
    unpaid += d.unpaidFraction;
    payable += d.payableHours;
    ot += d.overtimeHours;
    payableOt += d.payableOvertimeHours;
    for (const f of d.flags) flagCounts[f] = (flagCounts[f] ?? 0) + 1;
  }
  return {
    counts,
    workedDays: round2(workedDays),
    suggestedUnpaidDays: round2(unpaid),
    payableHours: round2(payable),
    overtimeHours: round2(ot),
    payableOvertimeHours: round2(payableOt),
    lateDays: counts.late,
    needsLateReview: counts.late >= settings.lateReviewCount,
    pendingDays: counts.pending,
    flagCounts,
  };
}

/** The monthly cap on "forgot to check in" corrections; beyond it only an admin override with a written reason. */
export function correctionAllowance(usedThisMonth: number, limit: number) {
  const remaining = Math.max(0, limit - usedThisMonth);
  return { allowed: usedThisMonth < limit, remaining, requiresAdminOverride: usedThisMonth >= limit };
}

/**
 * Whether a planned leave request gave enough notice. `leaveStart` is when the first leave day's
 * shift begins. Same-day sick leave is allowed but must carry a reason.
 */
export function checkLeaveNotice(params: {
  requestedAt: Date;
  leaveStart: Date;
  noticeHours: number;
  sameDaySick?: boolean;
}) {
  const given = round2((params.leaveStart.getTime() - params.requestedAt.getTime()) / 3_600_000);
  if (params.sameDaySick) {
    return { ok: true, noticeGivenHours: given, requiredHours: 0, requiresReason: true };
  }
  return { ok: given >= params.noticeHours, noticeGivenHours: given, requiredHours: params.noticeHours, requiresReason: false };
}
