import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import type { SessionPayload } from "@/lib/auth";
import { evaluateDay, spanHours, type DayResult } from "@/lib/workforce/attendance-rules";
import { isWorkforceFlagEnabled } from "@/lib/workforce/flags";
import {
  parseStoredLayer, resolveSettings, type ResolvedSettings, type SettingsChainEntry,
} from "@/lib/workforce/settings";
import { dateKey, localDay, tzOffsetMinutesFor, weekdayOf } from "@/lib/workforce/time";

/**
 * The daily record: loading an assignment's effective rules, deciding whether a day is a working
 * day, and the four contractor actions (check in, check out, "still online", end-of-day update).
 * Every state change goes through recomputeDay(), which runs the pure rules engine, so there is
 * exactly one place that decides what a day's status is.
 */
export class WorkforceError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const contextInclude = {
  project: { include: { client: true } },
  employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true, phone: true } },
  clientRep: true,
} satisfies Prisma.AssignmentInclude;

export type AssignmentRow = Prisma.AssignmentGetPayload<{ include: typeof contextInclude }>;

export interface AssignmentContext {
  assignment: AssignmentRow;
  resolved: ResolvedSettings;
  tzOffsetMinutes: number;
}

export async function loadSettingsFor(assignmentId: string, projectId: string, clientId: string): Promise<ResolvedSettings> {
  const rows = await db.settingsPolicy.findMany({
    where: { scopeKey: { in: [`assignment:${assignmentId}`, `project:${projectId}`, `client:${clientId}`, "company"] } },
  });
  const byKey = new Map(rows.map((r) => [r.scopeKey, parseStoredLayer(r.values)]));
  const chain: SettingsChainEntry[] = [
    { scope: "assignment", values: byKey.get(`assignment:${assignmentId}`) ?? {} },
    { scope: "project", values: byKey.get(`project:${projectId}`) ?? {} },
    { scope: "client", values: byKey.get(`client:${clientId}`) ?? {} },
    { scope: "company", values: byKey.get("company") ?? {} },
  ];
  return resolveSettings(chain);
}

export async function loadContext(assignmentId: string): Promise<AssignmentContext | null> {
  const assignment = await db.assignment.findUnique({ where: { id: assignmentId }, include: contextInclude });
  if (!assignment) return null;
  const resolved = await loadSettingsFor(assignment.id, assignment.projectId, assignment.project.clientId);
  return { assignment, resolved, tzOffsetMinutes: tzOffsetMinutesFor(assignment.timezone || assignment.project.client.timezone) };
}

export interface DayFacts {
  /** Assignment is active and the day is inside its dates. */
  assignmentLive: boolean;
  isHoliday: boolean;
  isWeeklyOff: boolean;
  leave: "none" | "paid" | "unpaid";
}

export async function dayFacts(ctx: AssignmentContext, day: Date): Promise<DayFacts> {
  const a = ctx.assignment;
  const working = new Set(a.workingDays.split(",").map(Number));
  const isWeeklyOff = !working.has(weekdayOf(day));
  const assignmentLive = a.status === "active" && a.startDate <= day && (!a.endDate || a.endDate >= day);

  const [clientHoliday, companyHoliday, leaveApp] = await Promise.all([
    db.clientHoliday.findUnique({ where: { clientId_date: { clientId: a.project.clientId, date: day } }, select: { id: true } }),
    db.holiday.findFirst({ where: { date: day, type: "holiday" }, select: { id: true } }),
    db.leaveApplication.findFirst({
      where: { employeeId: a.employeeId, status: "approved", startDate: { lte: day }, endDate: { gte: day } },
      include: { leaveType: { select: { isPaid: true } } },
    }),
  ]);

  return {
    assignmentLive,
    isHoliday: !!clientHoliday || !!companyHoliday,
    isWeeklyOff,
    leave: leaveApp ? (leaveApp.leaveType.isPaid ? "paid" : "unpaid") : "none",
  };
}

export async function ensureDailyStatus(assignmentId: string, day: Date) {
  return db.dailyStatus.upsert({
    where: { assignmentId_date: { assignmentId, date: day } },
    create: { assignmentId, date: day },
    update: {},
  });
}

/** Re-runs the rules engine for one day and stores the outcome. Locked days are never touched. */
export async function recomputeDay(dailyStatusId: string, opts: { close?: boolean; now?: Date } = {}) {
  const d = await db.dailyStatus.findUnique({ where: { id: dailyStatusId } });
  if (!d) throw new WorkforceError("Day not found.", 404);
  if (d.locked) return { daily: d, result: null as DayResult | null };

  const ctx = await loadContext(d.assignmentId);
  if (!ctx) throw new WorkforceError("Assignment not found.", 404);
  const facts = await dayFacts(ctx, d.date);

  // Hours: check-in to check-out when both exist (breaks included), else the hours the contractor
  // reported in the end-of-day update, else unknown (never guessed).
  const hours = spanHours(d.checkInAt, d.checkOutAt) ?? d.eodHours ?? null;
  const closed = d.closed || !!opts.close;

  const result = evaluateDay({
    settings: ctx.resolved.settings,
    tzOffsetMinutes: ctx.tzOffsetMinutes,
    dayClosed: closed,
    isHoliday: facts.isHoliday,
    isWeeklyOff: facts.isWeeklyOff,
    leave: (d.leaveOverride as "paid" | "unpaid" | null) ?? facts.leave,
    checkInAt: d.checkInAt,
    hoursWorked: hours,
    pulsesSent: d.pulsesSent,
    pulsesAnswered: d.pulsesAnswered,
    pulsesExcused: d.pulsesExcused,
    approvedOvertimeHours: d.approvedOvertimeHours,
  });

  const daily = await db.dailyStatus.update({
    where: { id: d.id },
    data: {
      state: result.state,
      lateMinutes: result.lateMinutes,
      hoursWorked: hours,
      evaluation: JSON.stringify(result),
      ...(opts.close && !d.closed ? { closed: true, closedAt: opts.now ?? new Date() } : {}),
    },
  });
  return { daily, result };
}

// ---- Contractor actions ---------------------------------------------------------------------

async function openDayForAction(assignmentId: string, now: Date) {
  const ctx = await loadContext(assignmentId);
  if (!ctx) throw new WorkforceError("Assignment not found.", 404);
  const { assignment } = ctx;
  const enabled = await isWorkforceFlagEnabled("contractor_workforce_enabled", {
    clientId: assignment.project.clientId, projectId: assignment.projectId,
  });
  if (!enabled) throw new WorkforceError("Daily check-in is not switched on for this project.", 403);

  const day = localDay(now, ctx.tzOffsetMinutes);
  const facts = await dayFacts(ctx, day);
  if (!facts.assignmentLive) throw new WorkforceError("This assignment is not active today.", 409);

  const daily = await ensureDailyStatus(assignmentId, day);
  if (daily.locked || daily.closed) throw new WorkforceError("This day is already closed. Ask your coordinator for a correction.", 409);
  return { ctx, day, daily };
}

export async function autoResolve(assignmentId: string, day: Date, types: string[], by: string, note: string) {
  const open = await db.exceptionCase.findMany({
    where: { assignmentId, date: day, type: { in: types }, status: { notIn: ["resolved", "dismissed"] } },
  });
  for (const ex of open) {
    const history = JSON.parse(ex.history || "[]");
    history.push({ at: new Date().toISOString(), by, action: "auto_resolved", note });
    await db.exceptionCase.update({
      where: { id: ex.id },
      data: { status: "resolved", resolution: note, resolvedAt: new Date(), resolvedBy: by, history: JSON.stringify(history) },
    });
  }
}

export type Actor = { session?: SessionPayload | null; label: string };

export async function recordCheckIn(params: { assignmentId: string; channel: string; now?: Date; actor: Actor }) {
  const now = params.now ?? new Date();
  const { day, daily } = await openDayForAction(params.assignmentId, now);
  if (daily.checkInAt) {
    const { daily: current, result } = await recomputeDay(daily.id);
    return { alreadyCheckedIn: true, daily: current, result };
  }
  await db.dailyStatus.update({ where: { id: daily.id }, data: { checkInAt: now, checkInChannel: params.channel } });
  const { daily: updated, result } = await recomputeDay(daily.id);
  await autoResolve(params.assignmentId, day, ["missing_checkin", "unresolved_checkin"], params.actor.label, "Contractor checked in.");
  await logAudit({ session: params.actor.session ?? null, action: "check_in", entity: "DailyStatus", entityId: daily.id, details: { channel: params.channel, by: params.actor.label } });
  return { alreadyCheckedIn: false, daily: updated, result };
}

export async function recordCheckOut(params: { assignmentId: string; channel: string; now?: Date; actor: Actor }) {
  const now = params.now ?? new Date();
  const { daily } = await openDayForAction(params.assignmentId, now);
  if (!daily.checkInAt) throw new WorkforceError("Check in first, then check out.", 409);
  await db.dailyStatus.update({ where: { id: daily.id }, data: { checkOutAt: now } });
  const { daily: updated, result } = await recomputeDay(daily.id);
  await logAudit({ session: params.actor.session ?? null, action: "check_out", entity: "DailyStatus", entityId: daily.id, details: { channel: params.channel, by: params.actor.label } });
  return { daily: updated, result };
}

/** Answer to a "still online?" pulse. "online"/"break" count as answered; "leave" also tells a coordinator. */
export async function recordPulseAnswer(params: {
  assignmentId: string; answer: "online" | "break" | "leave"; now?: Date; actor: Actor;
}) {
  const now = params.now ?? new Date();
  const { ctx, day, daily } = await openDayForAction(params.assignmentId, now);

  // Answer the oldest still-unanswered pulse of the day.
  const pending = await db.workforceMessage.findFirst({
    where: { assignmentId: params.assignmentId, date: day, type: "STILL_ONLINE", direction: "out", status: { in: ["sent", "delivered", "read"] } },
    orderBy: { createdAt: "asc" },
  });
  if (pending) {
    await db.workforceMessage.update({ where: { id: pending.id }, data: { status: "replied" } });
    await db.dailyStatus.update({ where: { id: daily.id }, data: { pulsesAnswered: { increment: 1 } } });
  }

  if (params.answer === "leave") {
    await db.exceptionCase.upsert({
      where: { dedupeKey: `reports_leave:${params.assignmentId}:${dateKey(day)}` },
      create: {
        dedupeKey: `reports_leave:${params.assignmentId}:${dateKey(day)}`,
        type: "contractor_reports_leave",
        severity: 3,
        needsCall: true,
        assignmentId: params.assignmentId,
        employeeId: ctx.assignment.employeeId,
        projectId: ctx.assignment.projectId,
        ownerId: ctx.assignment.resourceCoordinatorId,
        date: day,
        title: "Contractor says they must take leave today: confirm",
        detail: "Reported through the daily check. Confirm with the contractor and record the outcome.",
        slaDueAt: new Date(now.getTime() + 30 * 60_000),
      },
      update: {},
    });
  }
  const { daily: updated, result } = await recomputeDay(daily.id);
  return { daily: updated, result, answeredPulse: !!pending };
}

export interface EodFields {
  completed?: string | null;
  inProgress?: string | null;
  blockers?: string | null;
  hours?: number | null;
  tomorrow?: string | null;
  raw?: string | null;
}

export async function recordEod(params: { assignmentId: string; fields: EodFields; mode: "web_link" | "whatsapp_flow" | "free_text"; now?: Date; actor: Actor }) {
  const now = params.now ?? new Date();
  const { day, daily } = await openDayForAction(params.assignmentId, now);
  const f = params.fields;
  if (f.hours != null && (f.hours < 0 || f.hours > 24)) throw new WorkforceError("Hours must be between 0 and 24.", 400);
  const clip = (v: string | null | undefined) => (v ? v.trim().slice(0, 2000) || null : null);
  await db.dailyStatus.update({
    where: { id: daily.id },
    data: {
      eodMode: params.mode,
      eodCompleted: clip(f.completed),
      eodInProgress: clip(f.inProgress),
      eodBlockers: clip(f.blockers),
      eodTomorrow: clip(f.tomorrow),
      eodRaw: clip(f.raw),
      eodHours: f.hours ?? null,
      eodAt: now,
    },
  });
  const { daily: updated, result } = await recomputeDay(daily.id);
  await autoResolve(params.assignmentId, day, ["missing_eod"], params.actor.label, "End-of-day update received.");
  if (f.blockers && f.blockers.trim()) {
    await raiseException({
      dedupeKey: `blocker:${params.assignmentId}:${dateKey(day)}`,
      type: "blocker_reported",
      severity: 2,
      assignmentId: params.assignmentId,
      title: "Contractor reported a blocker",
      detail: f.blockers.trim().slice(0, 500),
      date: day,
    });
  }
  await logAudit({ session: params.actor.session ?? null, action: "eod_update", entity: "DailyStatus", entityId: daily.id, details: { mode: params.mode, by: params.actor.label } });
  return { daily: updated, result };
}

/** Creates an exception once per dedupeKey (a repeat call is a no-op) and notifies the owner in-app. */
export async function raiseException(params: {
  dedupeKey: string;
  type: string;
  severity: number;
  assignmentId: string;
  title: string;
  detail?: string;
  date: Date;
  needsCall?: boolean;
  ownerId?: string | null;
  slaMinutes?: number;
  now?: Date;
}) {
  const existing = await db.exceptionCase.findUnique({ where: { dedupeKey: params.dedupeKey } });
  if (existing) return { created: false as const, exception: existing };
  const assignment = await db.assignment.findUnique({ where: { id: params.assignmentId }, include: { project: true } });
  if (!assignment) throw new WorkforceError("Assignment not found.", 404);
  const now = params.now ?? new Date();
  const ownerId = params.ownerId ?? assignment.resourceCoordinatorId ?? assignment.kamId ?? assignment.clientCoordinatorId ?? null;
  const exception = await db.exceptionCase.create({
    data: {
      dedupeKey: params.dedupeKey,
      type: params.type,
      severity: params.severity,
      assignmentId: assignment.id,
      employeeId: assignment.employeeId,
      projectId: assignment.projectId,
      ownerId,
      date: params.date,
      title: params.title,
      detail: params.detail ?? null,
      needsCall: params.needsCall ?? false,
      slaDueAt: params.slaMinutes ? new Date(now.getTime() + params.slaMinutes * 60_000) : null,
      history: JSON.stringify([{ at: now.toISOString(), by: "system", action: "created", note: params.title }]),
    },
  });
  return { created: true as const, exception };
}
