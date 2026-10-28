import { db } from "@/lib/db";
import { getDaysInMonth } from "@/lib/payroll/engine";
import { evaluateDay, summarizeMonth, type DayResult, type MonthSummary } from "@/lib/workforce/attendance-rules";
import { computePayPrefill, countWorkingDays, type PayType, type MonthlyDayBasis, type PrefillResult } from "@/lib/workforce/pay-prefill";
import { loadContext, dayFacts } from "@/lib/workforce/daily";
import { localDay } from "@/lib/workforce/time";

/**
 * Month-end roll-up for a project: per assignment, the attendance summary, anything blocking the
 * month from locking, and a SUGGESTED alternate-pay entry. It computes proposals only; locking and
 * every pay-affecting decision are admin actions (see the month/lock and suggestions routes).
 */
export interface AssignmentMonth {
  assignmentId: string;
  employeeId: string;
  employeeCode: string;
  contractor: string;
  payType: string;
  payRate: number | null;
  monthlyDayBasis: string;
  workingDaysInMonth: number;
  /** Working days in the month that fall outside the assignment's dates (joined late / ended early). */
  outsideUnpaidDays: number;
  summary: MonthSummary;
  /** Days that cannot be decided yet: still open, or a working day with no record at all. */
  undecidedDays: number;
  openDisputes: number;
  blockingExceptions: number;
  prefill: PrefillResult;
  /** What the prefill would be with no absence deduction, so an admin can reject the deduction. */
  prefillWithoutDeduction: PrefillResult | null;
}

export interface ProjectMonth {
  projectId: string;
  year: number;
  month: number;
  assignments: AssignmentMonth[];
  signOff: { status: string; signedAt: Date | null } | null;
  lock: { lockedAt: Date } | null;
  ready: boolean;
  blockers: string[];
}

export function monthRange(year: number, month: number) {
  return { start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 1)), days: getDaysInMonth(month, year) };
}

export async function buildProjectMonth(projectId: string, year: number, month: number, now: Date = new Date()): Promise<ProjectMonth> {
  const { start, end, days } = monthRange(year, month);
  const assignments = await db.assignment.findMany({
    where: { projectId, status: { not: "planned" }, startDate: { lt: end }, OR: [{ endDate: null }, { endDate: { gte: start } }] },
    include: { employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } }, project: { select: { clientId: true } } },
    orderBy: { createdAt: "asc" },
  });

  const out: AssignmentMonth[] = [];
  for (const a of assignments) {
    const ctx = await loadContext(a.id);
    if (!ctx) continue;
    const settings = ctx.resolved.settings;
    const working = a.workingDays.split(",").map(Number);
    const rows = await db.dailyStatus.findMany({ where: { assignmentId: a.id, date: { gte: start, lt: end } } });
    const byDate = new Map(rows.map((r) => [r.date.getTime(), r]));
    const today = localDay(now, ctx.tzOffsetMinutes);

    const [clientHolidays, companyHolidays] = await Promise.all([
      db.clientHoliday.findMany({ where: { clientId: a.project.clientId, date: { gte: start, lt: end } }, select: { date: true } }),
      db.holiday.findMany({ where: { date: { gte: start, lt: end }, type: "holiday" }, select: { date: true } }),
    ]);
    const holidayDays = [...clientHolidays, ...companyHolidays].map((h) => ({ year, month, day: h.date.getUTCDate() }));
    const workingDaysInMonth = countWorkingDays(year, month, working, holidayDays);

    const results: DayResult[] = [];
    let undecided = 0;
    let outsideWorking = 0;
    let outsideCalendar = 0;
    for (let d = 1; d <= days; d++) {
      const day = new Date(Date.UTC(year, month - 1, d));
      const inside = a.startDate <= day && (!a.endDate || a.endDate >= day);
      const isWorkingWeekday = working.includes(day.getUTCDay()) && !holidayDays.some((h) => h.day === d);
      if (!inside) {
        outsideCalendar++;
        if (isWorkingWeekday) outsideWorking++;
        continue;
      }
      const row = byDate.get(day.getTime());
      if (row && (row.closed || row.locked) && row.evaluation) {
        results.push(JSON.parse(row.evaluation) as DayResult);
        continue;
      }
      // No finished record. A non-working day with nothing on it is simply that day...
      const facts = await dayFacts(ctx, day);
      const nonWorking = facts.isHoliday || facts.isWeeklyOff || ((row?.leaveOverride as string | null) ?? facts.leave) !== "none";
      if (!row?.checkInAt && nonWorking) {
        results.push(evaluateDay({
          settings, tzOffsetMinutes: ctx.tzOffsetMinutes, dayClosed: true, isHoliday: facts.isHoliday, isWeeklyOff: facts.isWeeklyOff,
          leave: ((row?.leaveOverride as "paid" | "unpaid" | null) ?? facts.leave), checkInAt: null, hoursWorked: null, pulsesSent: 0, pulsesAnswered: 0,
        }));
        continue;
      }
      // ...but a working day that was never closed (or never recorded) cannot be decided yet.
      undecided++;
      if (day >= today) continue; // today/future: just not finished, still counted as undecided
    }

    const summary = summarizeMonth(results, settings);
    const payType = a.payType as PayType;
    const basis = a.monthlyDayBasis as MonthlyDayBasis;
    const outsideUnpaid = basis === "calendar" ? outsideCalendar : outsideWorking;
    const make = (unpaid: number): PrefillResult =>
      computePayPrefill({
        payType, payRate: a.payRate, monthlyDayBasis: basis, year, month, workingDaysInMonth,
        unpaidDays: unpaid + outsideUnpaid, payableDays: summary.workedDays, approvedHours: summary.payableHours,
      });

    const [openDisputes, blockingExceptions] = await Promise.all([
      db.dispute.count({ where: { status: "open", dailyStatus: { assignmentId: a.id, date: { gte: start, lt: end } } } }),
      db.exceptionCase.count({ where: { assignmentId: a.id, date: { gte: start, lt: end }, severity: { gte: 3 }, status: { notIn: ["resolved", "dismissed"] } } }),
    ]);

    out.push({
      assignmentId: a.id, employeeId: a.employeeId, employeeCode: a.employee.employeeCode,
      contractor: `${a.employee.firstName} ${a.employee.lastName ?? ""}`.trim(),
      payType: a.payType, payRate: a.payRate, monthlyDayBasis: a.monthlyDayBasis, workingDaysInMonth, outsideUnpaidDays: outsideUnpaid,
      summary, undecidedDays: undecided + summary.pendingDays, openDisputes, blockingExceptions,
      prefill: make(summary.suggestedUnpaidDays),
      prefillWithoutDeduction: payType === "monthly" && summary.suggestedUnpaidDays > 0 ? make(0) : null,
    });
  }

  const [signOff, lock] = await Promise.all([
    db.clientSignOff.findUnique({ where: { projectId_year_month: { projectId, year, month } } }),
    db.monthLock.findUnique({ where: { projectId_year_month: { projectId, year, month } } }),
  ]);

  const blockers: string[] = [];
  const nowLocal = localDay(now, 330);
  if (nowLocal < end && now < end) blockers.push("The month has not ended yet.");
  for (const a of out) {
    if (a.undecidedDays > 0) blockers.push(`${a.contractor}: ${a.undecidedDays} day(s) still undecided.`);
    if (a.openDisputes > 0) blockers.push(`${a.contractor}: ${a.openDisputes} open dispute(s).`);
    if (a.blockingExceptions > 0) blockers.push(`${a.contractor}: ${a.blockingExceptions} unresolved exception(s) of severity 3 or higher.`);
    if (!a.prefill.ok) blockers.push(`${a.contractor}: ${a.prefill.reason}`);
  }
  if (out.length === 0) blockers.push("No assignments in this month.");
  return {
    projectId, year, month, assignments: out,
    signOff: signOff ? { status: signOff.status, signedAt: signOff.signedAt } : null,
    lock: lock ? { lockedAt: lock.lockedAt } : null,
    ready: blockers.length === 0, blockers,
  };
}

/** Maps a rules-engine state onto the existing Attendance.status vocabulary (so reports keep working). */
export function attendanceStatusFor(state: string, unpaidFraction = 0): string {
  switch (state) {
    case "present": case "late": return "present";
    case "half_day": return "half-day";
    case "holiday": return "holiday";
    case "weekly_off": return "weekly-off";
    // The existing payroll tally counts "present" as a paid day: paid leave stays paid, unpaid leave is an absence.
    case "leave": return unpaidFraction >= 1 ? "absent" : "present";
    default: return "absent";
  }
}
