import { db } from "@/lib/db";
import { computeReliability, type ReliabilityResult } from "@/lib/workforce/reliability";

export type GroupBy = "project" | "client" | "contractor" | "coordinator";

export interface ReportRow {
  key: string;
  label: string;
  assignments: number;
  workingDays: number;
  attendedDays: number;
  attendanceRate: number | null;
  checkInRate: number | null;
  lateDays: number;
  halfDays: number;
  absentDays: number;
  leaveDays: number;
  avgLateMinutes: number | null;
  hoursWorked: number;
  overtimeHours: number;
  eodRate: number | null;
  clientConfirmRate: number | null;
  exceptionsOpened: number;
  exceptionsOpen: number;
  avgResolutionMinutes: number | null;
  disputes: number;
  corrections: number;
  reliability: ReliabilityResult | null;
}

const ratio = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 1000 : null);

/**
 * Aggregates the daily records of the given assignments into one row per group. `assignmentIds`
 * is ALREADY the caller's permitted set (the route scopes it), so this never widens access.
 */
export async function buildReport(params: { assignmentIds: string[]; from: Date; to: Date; groupBy: GroupBy }): Promise<ReportRow[]> {
  const { assignmentIds, from, to, groupBy } = params;
  if (assignmentIds.length === 0) return [];

  const assignments = await db.assignment.findMany({
    where: { id: { in: assignmentIds } },
    include: { project: { include: { client: true } }, employee: { select: { id: true, firstName: true, lastName: true } } },
  });
  const coordinatorIds = [...new Set(assignments.map((a) => a.resourceCoordinatorId).filter((x): x is string => !!x))];
  const users = await db.user.findMany({ where: { id: { in: coordinatorIds } }, select: { id: true, name: true } });
  const userName = new Map(users.map((u) => [u.id, u.name]));

  const keyOf = (a: (typeof assignments)[number]): { key: string; label: string } => {
    switch (groupBy) {
      case "project": return { key: a.projectId, label: `${a.project.client.name} / ${a.project.name}` };
      case "client": return { key: a.project.clientId, label: a.project.client.name };
      case "contractor": return { key: a.employeeId, label: `${a.employee.firstName} ${a.employee.lastName ?? ""}`.trim() };
      case "coordinator": return { key: a.resourceCoordinatorId ?? "none", label: a.resourceCoordinatorId ? userName.get(a.resourceCoordinatorId) ?? "Unknown" : "Unassigned" };
    }
  };
  const groupOf = new Map(assignments.map((a) => [a.id, keyOf(a)]));

  const [days, exceptions, disputes, corrections, feedback, pulses] = await Promise.all([
    db.dailyStatus.findMany({ where: { assignmentId: { in: assignmentIds }, date: { gte: from, lte: to } } }),
    db.exceptionCase.findMany({ where: { assignmentId: { in: assignmentIds }, date: { gte: from, lte: to } }, select: { assignmentId: true, status: true, createdAt: true, resolvedAt: true } }),
    db.dispute.findMany({ where: { dailyStatus: { assignmentId: { in: assignmentIds }, date: { gte: from, lte: to } } }, select: { dailyStatus: { select: { assignmentId: true } } } }),
    db.correction.findMany({ where: { dailyStatus: { assignmentId: { in: assignmentIds }, date: { gte: from, lte: to } } }, select: { dailyStatus: { select: { assignmentId: true } } } }),
    db.clientFeedback.findMany({ where: { assignmentId: { in: assignmentIds }, weekOf: { gte: new Date(from.getTime() - 6 * 86_400_000), lte: to } } }),
    Promise.resolve(null),
  ]);
  void pulses;

  interface Acc {
    label: string; assignmentIds: Set<string>; working: number; attended: number; checkIns: number; late: number; half: number; absent: number; leave: number;
    lateMinutes: number; lateCount: number; hours: number; ot: number; eod: number; workedForEod: number; confirmed: number; confirmable: number;
    excOpened: number; excOpen: number; resMinutes: number; resCount: number; disputes: number; corrections: number;
    pulsesSent: number; pulsesAnswered: number; onTrackYes: number; onTrackTotal: number; ratingSum: number; ratingCount: number;
  }
  const acc = new Map<string, Acc>();
  const get = (assignmentId: string): Acc | null => {
    const g = groupOf.get(assignmentId);
    if (!g) return null;
    if (!acc.has(g.key)) {
      acc.set(g.key, { label: g.label, assignmentIds: new Set(), working: 0, attended: 0, checkIns: 0, late: 0, half: 0, absent: 0, leave: 0, lateMinutes: 0, lateCount: 0, hours: 0, ot: 0, eod: 0, workedForEod: 0, confirmed: 0, confirmable: 0, excOpened: 0, excOpen: 0, resMinutes: 0, resCount: 0, disputes: 0, corrections: 0, pulsesSent: 0, pulsesAnswered: 0, onTrackYes: 0, onTrackTotal: 0, ratingSum: 0, ratingCount: 0 });
    }
    const a = acc.get(g.key)!;
    a.assignmentIds.add(assignmentId);
    return a;
  };
  for (const a of assignments) get(a.id);

  for (const d of days) {
    const a = get(d.assignmentId);
    if (!a) continue;
    if (d.state === "leave") a.leave++;
    if (["present", "late", "half_day", "absent"].includes(d.state) && d.closed) {
      a.working++;
      if (d.state === "present" || d.state === "late") a.attended += 1;
      if (d.state === "half_day") { a.attended += 0.5; a.half++; }
      if (d.state === "late") { a.late++; a.lateMinutes += d.lateMinutes; a.lateCount++; }
      if (d.state === "absent") a.absent++;
      if (d.checkInAt) a.checkIns++;
      if (d.state !== "absent") { a.workedForEod++; if (d.eodAt) a.eod++; }
      a.confirmable++;
      if (d.clientConfirm === "confirmed") a.confirmed++;
    }
    a.hours += d.hoursWorked ?? 0;
    if (d.evaluation) a.ot += JSON.parse(d.evaluation).overtimeHours ?? 0;
    a.pulsesSent += d.pulsesSent;
    a.pulsesAnswered += d.pulsesAnswered;
  }
  for (const e of exceptions) {
    const a = e.assignmentId ? get(e.assignmentId) : null;
    if (!a) continue;
    a.excOpened++;
    if (e.status === "resolved" && e.resolvedAt) { a.resCount++; a.resMinutes += (e.resolvedAt.getTime() - e.createdAt.getTime()) / 60000; }
    else if (e.status !== "dismissed") a.excOpen++;
  }
  for (const d of disputes) get(d.dailyStatus.assignmentId)!.disputes++;
  for (const c of corrections) get(c.dailyStatus.assignmentId)!.corrections++;
  for (const f of feedback) {
    const a = get(f.assignmentId);
    if (!a) continue;
    if (f.onTrack != null) { a.onTrackTotal++; if (f.onTrack) a.onTrackYes++; }
    if (f.rating != null) { a.ratingCount++; a.ratingSum += f.rating; }
  }

  return [...acc.entries()].map(([key, a]) => ({
    key, label: a.label, assignments: a.assignmentIds.size, workingDays: a.working, attendedDays: Math.round(a.attended * 10) / 10,
    attendanceRate: ratio(a.attended, a.working), checkInRate: ratio(a.checkIns, a.working),
    lateDays: a.late, halfDays: a.half, absentDays: a.absent, leaveDays: a.leave,
    avgLateMinutes: a.lateCount ? Math.round(a.lateMinutes / a.lateCount) : null,
    hoursWorked: Math.round(a.hours * 10) / 10, overtimeHours: Math.round(a.ot * 10) / 10,
    eodRate: ratio(a.eod, a.workedForEod), clientConfirmRate: ratio(a.confirmed, a.confirmable),
    exceptionsOpened: a.excOpened, exceptionsOpen: a.excOpen, avgResolutionMinutes: a.resCount ? Math.round(a.resMinutes / a.resCount) : null,
    disputes: a.disputes, corrections: a.corrections,
    reliability: groupBy === "contractor" || groupBy === "project"
      ? computeReliability({
          workingDays: a.working,
          attendance: ratio(a.attended, a.working),
          timesheet: ratio(a.eod, a.workedForEod),
          delivery: ratio(a.onTrackYes, a.onTrackTotal),
          clientFeedback: a.ratingCount ? (a.ratingSum / a.ratingCount - 1) / 4 : null,
          response: a.pulsesSent > 0 ? ratio(a.pulsesAnswered, a.pulsesSent) : null,
          availability: a.working > 0 ? 1 - a.absent / a.working : null,
        })
      : null,
  })).sort((x, y) => x.label.localeCompare(y.label));
}

export function reportToCsv(rows: ReportRow[]): string {
  const head = ["Group", "Assignments", "Working days", "Attended days", "Attendance %", "Check-in %", "Late days", "Half days", "Absent days", "Leave days", "Avg late (min)", "Hours worked", "Overtime hours", "EOD update %", "Client confirm %", "Exceptions opened", "Exceptions open", "Avg resolution (min)", "Disputes", "Corrections", "Reliability score", "Band"];
  const pct = (v: number | null) => (v == null ? "" : String(Math.round(v * 1000) / 10));
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = rows.map((r) => [
    esc(r.label), r.assignments, r.workingDays, r.attendedDays, pct(r.attendanceRate), pct(r.checkInRate), r.lateDays, r.halfDays, r.absentDays, r.leaveDays,
    r.avgLateMinutes ?? "", r.hoursWorked, r.overtimeHours, pct(r.eodRate), pct(r.clientConfirmRate), r.exceptionsOpened, r.exceptionsOpen,
    r.avgResolutionMinutes ?? "", r.disputes, r.corrections, r.reliability?.score ?? "", r.reliability?.band ?? "",
  ].join(","));
  return [head.join(","), ...lines].join("\n");
}
