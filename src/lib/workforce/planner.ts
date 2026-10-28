import { localMinutesOfDay } from "@/lib/workforce/attendance-rules";
import { timeToMinutes, type WorkforceSettings } from "@/lib/workforce/settings";

/**
 * The escalation ladder as a PURE planner (docs/CONTRACTOR_MONITORING_SPEC.md §8.1): given the
 * facts about one assignment on one local day and the current time, it returns the actions that
 * are due. It performs nothing itself. The executor (tick.ts) records each action under its
 * idempotency key, so planning the same moment twice, restarting the worker, or a tick running
 * late can never send or raise anything twice.
 */
export type ContractorMessageType =
  | "CHECK_IN" | "LATE_REMINDER" | "FINAL_REMINDER" | "STILL_ONLINE" | "END_OF_DAY" | "EOD_REMINDER";
export type ClientMessageType = "CLIENT_STATUS_NOTICE" | "CLIENT_DIGEST";
export type MessageType = ContractorMessageType | ClientMessageType;

/** Lower number = more important. When a contractor nears the daily cap, higher numbers are dropped first. */
export const MESSAGE_PRIORITY: Record<MessageType, number> = {
  CHECK_IN: 1,
  CLIENT_STATUS_NOTICE: 1,
  CLIENT_DIGEST: 1,
  LATE_REMINDER: 2,
  FINAL_REMINDER: 2,
  END_OF_DAY: 3,
  STILL_ONLINE: 4,
  EOD_REMINDER: 5,
};

export type ExceptionOwner = "resource_coordinator" | "client_coordinator" | "kam";

export type PlannedAction =
  | { kind: "message"; messageType: MessageType; seq: number; audience: "contractor" | "client"; idempotencyKey: string; priority: number }
  | {
      kind: "exception";
      type: string;
      severity: 0 | 1 | 2 | 3 | 4 | 5;
      needsCall: boolean;
      owner: ExceptionOwner;
      dedupeKey: string;
      title: string;
      detail: string;
      slaMinutes: number;
    };

export interface PulseFact {
  seq: number;
  sentAt: Date;
  answered: boolean;
}

export interface PlanInput {
  now: Date;
  tzOffsetMinutes: number;
  /** Local calendar day being planned, "YYYY-MM-DD" (used in idempotency keys). */
  dateKey: string;
  assignmentId: string;
  settings: WorkforceSettings;
  /** False on holidays, weekly offs, approved leave days, or outside the assignment's dates. */
  isWorkingDay: boolean;
  checkedIn: boolean;
  checkedOut: boolean;
  eodDone: boolean;
  pulses: PulseFact[];
  /** Client-facing messages require the client-digest flag and a client representative on file. */
  clientNoticesEnabled: boolean;
  hasClientRep: boolean;
}

const msg = (
  p: PlanInput,
  messageType: MessageType,
  seq: number,
  audience: "contractor" | "client"
): PlannedAction => ({
  kind: "message",
  messageType,
  seq,
  audience,
  idempotencyKey: `${p.assignmentId}:${p.dateKey}:${messageType}:${seq}`,
  priority: MESSAGE_PRIORITY[messageType],
});

/** Longest run of consecutive missed pulses. A pulse still inside its answer window breaks the run. */
export function longestMissedRun(pulses: PulseFact[], now: Date, expiryMinutes: number): number {
  let run = 0;
  let best = 0;
  for (const pulse of [...pulses].sort((a, b) => a.seq - b.seq)) {
    const expired = now.getTime() >= pulse.sentAt.getTime() + expiryMinutes * 60_000;
    if (pulse.answered) run = 0;
    else if (expired) { run++; best = Math.max(best, run); }
    else run = 0; // still waiting for an answer
  }
  return best;
}

export function planActions(p: PlanInput): PlannedAction[] {
  if (!p.isWorkingDay) return [];
  const s = p.settings;
  const actions: PlannedAction[] = [];
  const nowMin = localMinutesOfDay(p.now, p.tzOffsetMinutes);
  const startMin = timeToMinutes(s.shiftStart);
  const endMin = timeToMinutes(s.shiftEnd);

  // ---- Morning: check-in ladder. Each step is valid until the next one takes over, so a worker
  // that was down and comes back at T+20 sends the late reminder, not a stale "good morning".
  if (!p.checkedIn) {
    const prompt = startMin - s.checkInPromptMinutesBefore;
    const late = startMin + s.lateReminderAfterMinutes;
    const final = startMin + s.finalReminderAfterMinutes;
    const call = startMin + s.callTaskAfterMinutes;
    const client = startMin + s.clientNoticeAfterMinutes;

    if (nowMin >= prompt && nowMin < late) actions.push(msg(p, "CHECK_IN", 0, "contractor"));
    if (nowMin >= late && nowMin < final) actions.push(msg(p, "LATE_REMINDER", 0, "contractor"));
    if (nowMin >= final && nowMin < endMin) actions.push(msg(p, "FINAL_REMINDER", 0, "contractor"));

    if (nowMin >= call && nowMin < endMin) {
      actions.push({
        kind: "exception",
        type: "missing_checkin",
        severity: 3,
        needsCall: true,
        owner: "resource_coordinator",
        dedupeKey: `missing_checkin:${p.assignmentId}:${p.dateKey}`,
        title: "No check-in: call the contractor",
        detail: `No check-in ${s.callTaskAfterMinutes} min after shift start (${s.shiftStart}).`,
        slaMinutes: 30,
      });
    }
    if (nowMin >= client && nowMin < endMin) {
      actions.push({
        kind: "exception",
        type: "unresolved_checkin",
        severity: 3,
        needsCall: false,
        owner: "client_coordinator",
        dedupeKey: `unresolved_checkin:${p.assignmentId}:${p.dateKey}`,
        title: "Check-in still unresolved: update the client",
        detail: `Still no check-in ${s.clientNoticeAfterMinutes} min after shift start.`,
        slaMinutes: 30,
      });
      if (p.clientNoticesEnabled && p.hasClientRep) actions.push(msg(p, "CLIENT_STATUS_NOTICE", 0, "client"));
    }
    return actions; // nothing else (pulses, end of day) applies until they have checked in
  }

  // ---- Midday: "still online" pulses, only while checked in and not checked out.
  if (!p.checkedOut && nowMin < endMin) {
    s.pulseTimes.forEach((t, i) => {
      const at = timeToMinutes(t);
      // Skip a pulse that is already hours stale (e.g. the worker was down all afternoon).
      if (nowMin >= at && nowMin < at + 120) actions.push(msg(p, "STILL_ONLINE", i + 1, "contractor"));
    });
    if (longestMissedRun(p.pulses, p.now, s.pulseExpiryMinutes) >= s.pulseMissLimit) {
      actions.push({
        kind: "exception",
        type: "missed_pulses",
        severity: 3,
        needsCall: true,
        owner: "resource_coordinator",
        dedupeKey: `missed_pulses:${p.assignmentId}:${p.dateKey}`,
        title: "Missed 'still online' checks: call the contractor",
        detail: `${s.pulseMissLimit} consecutive "still online" checks went unanswered.`,
        slaMinutes: 30,
      });
    }
  }

  // ---- Evening: end-of-day update and its reminders.
  if (!p.eodDone) {
    const promptAt = endMin - s.eodPromptMinutesBeforeEnd;
    if (nowMin >= promptAt) actions.push(msg(p, "END_OF_DAY", 0, "contractor"));
    s.eodReminderAfterMinutes.forEach((after, i) => {
      if (nowMin >= promptAt + after) actions.push(msg(p, "EOD_REMINDER", i + 1, "contractor"));
    });
    const lastReminder = s.eodReminderAfterMinutes.length > 0 ? Math.max(...s.eodReminderAfterMinutes) : 0;
    if (nowMin >= promptAt + lastReminder + 30) {
      actions.push({
        kind: "exception",
        type: "missing_eod",
        severity: 2,
        needsCall: false,
        owner: "resource_coordinator",
        dedupeKey: `missing_eod:${p.assignmentId}:${p.dateKey}`,
        title: "End-of-day update missing",
        detail: "No end-of-day update after the reminders.",
        slaMinutes: 24 * 60,
      });
    }
  }

  return actions;
}

/**
 * Whether a message may go out now, given quiet hours and the daily cap. Critical messages
 * (priority 1-2) can exceed the soft cap up to the hard ceiling; lower-priority ones are dropped
 * once the cap is reached, so the check-in prompt can never be starved by reminders.
 */
export function messageAllowed(params: {
  now: Date;
  tzOffsetMinutes: number;
  settings: Pick<WorkforceSettings, "quietHoursStart" | "quietHoursEnd" | "dailyMessageCap">;
  sentToday: number;
  priority: number;
  hardCeiling: number;
}): { ok: true } | { ok: false; reason: "quiet_hours" | "daily_cap" | "hard_ceiling" } {
  const { settings: s } = params;
  const nowMin = localMinutesOfDay(params.now, params.tzOffsetMinutes);
  const qs = timeToMinutes(s.quietHoursStart);
  const qe = timeToMinutes(s.quietHoursEnd);
  const inQuiet = qs === qe ? false : qs < qe ? nowMin >= qs && nowMin < qe : nowMin >= qs || nowMin < qe;
  if (inQuiet) return { ok: false, reason: "quiet_hours" };
  if (params.sentToday >= params.hardCeiling) return { ok: false, reason: "hard_ceiling" };
  if (params.sentToday >= s.dailyMessageCap && params.priority > 2) return { ok: false, reason: "daily_cap" };
  return { ok: true };
}
