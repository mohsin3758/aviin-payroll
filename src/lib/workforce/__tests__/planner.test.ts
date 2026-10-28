import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS } from "../settings";
import { planActions, messageAllowed, longestMissedRun, MESSAGE_PRIORITY, type PlanInput, type PlannedAction } from "../planner";

const IST = 330;
/** IST wall-clock time on Tue 3 Nov 2026. */
const at = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 3, h, m) - IST * 60_000);

function plan(over: Partial<PlanInput> & { h?: number; m?: number } = {}): PlannedAction[] {
  const { h = 9, m = 0, ...rest } = over;
  return planActions({
    now: at(h, m),
    tzOffsetMinutes: IST,
    dateKey: "2026-11-03",
    assignmentId: "a1",
    settings: DEFAULT_SETTINGS,
    isWorkingDay: true,
    checkedIn: false,
    checkedOut: false,
    eodDone: false,
    pulses: [],
    clientNoticesEnabled: true,
    hasClientRep: true,
    ...rest,
  });
}
const messages = (a: PlannedAction[]) => a.filter((x) => x.kind === "message").map((x) => (x as { messageType: string; seq: number }).messageType + ":" + (x as { seq: number }).seq);
const exceptions = (a: PlannedAction[]) => a.filter((x) => x.kind === "exception").map((x) => (x as { type: string }).type);

describe("morning ladder (shift 09:00)", () => {
  it("does nothing before the prompt time", () => {
    expect(plan({ h: 8, m: 30 })).toEqual([]);
  });
  it("sends the check-in prompt 15 minutes before shift start", () => {
    expect(messages(plan({ h: 8, m: 45 }))).toEqual(["CHECK_IN:0"]);
    expect(messages(plan({ h: 9, m: 0 }))).toEqual(["CHECK_IN:0"]);
  });
  it("late reminder at T+15, final at T+30 — each replaces the previous step", () => {
    expect(messages(plan({ h: 9, m: 15 }))).toEqual(["LATE_REMINDER:0"]);
    expect(messages(plan({ h: 9, m: 30 }))).toEqual(["FINAL_REMINDER:0"]);
  });
  it("creates the call task for the resource coordinator at T+45, not before", () => {
    expect(exceptions(plan({ h: 9, m: 44 }))).toEqual([]);
    const a = plan({ h: 9, m: 45 });
    const call = a.find((x) => x.kind === "exception") as Extract<PlannedAction, { kind: "exception" }>;
    expect(call).toMatchObject({ type: "missing_checkin", severity: 3, needsCall: true, owner: "resource_coordinator" });
    expect(call.dedupeKey).toBe("missing_checkin:a1:2026-11-03");
  });
  it("alerts the client coordinator and notifies the client at T+90", () => {
    const a = plan({ h: 10, m: 30 });
    expect(exceptions(a)).toEqual(["missing_checkin", "unresolved_checkin"]);
    expect(messages(a)).toContain("CLIENT_STATUS_NOTICE:0");
  });
  it("no client message unless client notices are enabled and a representative exists", () => {
    expect(messages(plan({ h: 10, m: 30, clientNoticesEnabled: false }))).not.toContain("CLIENT_STATUS_NOTICE:0");
    expect(messages(plan({ h: 10, m: 30, hasClientRep: false }))).not.toContain("CLIENT_STATUS_NOTICE:0");
    // ...but the internal exception is still raised.
    expect(exceptions(plan({ h: 10, m: 30, clientNoticesEnabled: false }))).toContain("unresolved_checkin");
  });
  it("a worker that was down and returns at 09:20 sends the late reminder, not a stale prompt", () => {
    expect(messages(plan({ h: 9, m: 20 }))).toEqual(["LATE_REMINDER:0"]);
  });
  it("is silent for someone who has checked in", () => {
    expect(plan({ h: 9, m: 50, checkedIn: true, pulses: [] })).toEqual([]);
  });
  it("is silent on non-working days", () => {
    expect(plan({ h: 9, m: 50, isWorkingDay: false })).toEqual([]);
  });
  it("is deterministic: the same moment plans the same keys (idempotent)", () => {
    const a = plan({ h: 10, m: 30 });
    const b = plan({ h: 10, m: 30 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it("honours per-client timing", () => {
    const settings = { ...DEFAULT_SETTINGS, shiftStart: "10:00", callTaskAfterMinutes: 20 };
    expect(exceptions(plan({ h: 9, m: 0, settings }))).toEqual([]);
    expect(exceptions(plan({ h: 10, m: 20, settings }))).toContain("missing_checkin");
  });
});

describe("pulses", () => {
  const checked = { checkedIn: true };
  it("sends pulse 1 at 13:00 and pulse 2 at 16:00 while checked in", () => {
    expect(messages(plan({ ...checked, h: 13, m: 0 }))).toEqual(["STILL_ONLINE:1"]);
    expect(messages(plan({ ...checked, h: 16, m: 0 }))).toContain("STILL_ONLINE:2");
  });
  it("does not send pulses after check-out or once a pulse is hours stale", () => {
    expect(messages(plan({ ...checked, checkedOut: true, h: 13, m: 0 }))).toEqual([]);
    expect(messages(plan({ ...checked, h: 15, m: 30 }))).not.toContain("STILL_ONLINE:1");
  });
  it("two consecutive unanswered pulses raise a call task; one does not", () => {
    const pulses = [
      { seq: 1, sentAt: at(13, 0), answered: false },
      { seq: 2, sentAt: at(16, 0), answered: false },
    ];
    expect(exceptions(plan({ ...checked, h: 16, m: 40, pulses }))).toContain("missed_pulses");
    expect(exceptions(plan({ ...checked, h: 16, m: 40, pulses: [pulses[0], { ...pulses[1], answered: true }] }))).not.toContain("missed_pulses");
  });
  it("a pulse still inside its answer window is not 'missed' yet", () => {
    const pulses = [
      { seq: 1, sentAt: at(13, 0), answered: false },
      { seq: 2, sentAt: at(16, 0), answered: false },
    ];
    expect(exceptions(plan({ ...checked, h: 16, m: 10, pulses }))).not.toContain("missed_pulses");
  });
});

describe("longestMissedRun", () => {
  const p = (seq: number, h: number, answered: boolean) => ({ seq, sentAt: at(h, 0), answered });
  it("an answered pulse breaks a run", () => {
    expect(longestMissedRun([p(1, 10, false), p(2, 11, true), p(3, 12, false)], at(15, 0), 30)).toBe(1);
    expect(longestMissedRun([p(1, 10, false), p(2, 11, false), p(3, 12, true)], at(15, 0), 30)).toBe(2);
  });
});

describe("end of day", () => {
  const checked = { checkedIn: true, checkedOut: false };
  it("prompts 30 minutes before shift end, then reminds at +30 and +60", () => {
    expect(messages(plan({ ...checked, h: 17, m: 29 }))).not.toContain("END_OF_DAY:0");
    expect(messages(plan({ ...checked, h: 17, m: 30 }))).toContain("END_OF_DAY:0");
    expect(messages(plan({ ...checked, h: 18, m: 0 }))).toContain("EOD_REMINDER:1");
    expect(messages(plan({ ...checked, h: 18, m: 30 }))).toContain("EOD_REMINDER:2");
  });
  it("raises a missing-update exception only after the reminders are exhausted", () => {
    expect(exceptions(plan({ ...checked, h: 18, m: 30 }))).not.toContain("missing_eod");
    expect(exceptions(plan({ ...checked, h: 19, m: 0 }))).toContain("missing_eod");
  });
  it("stops once the update is in", () => {
    expect(plan({ ...checked, eodDone: true, h: 19, m: 30 })).toEqual([]);
  });
});

describe("messageAllowed: quiet hours and the daily cap", () => {
  const s = { quietHoursStart: "21:00", quietHoursEnd: "07:00", dailyMessageCap: 8 };
  const base = { tzOffsetMinutes: IST, settings: s, hardCeiling: 12 };
  it("blocks messages inside quiet hours (which wrap midnight)", () => {
    expect(messageAllowed({ ...base, now: at(22, 0), sentToday: 0, priority: 1 })).toEqual({ ok: false, reason: "quiet_hours" });
    expect(messageAllowed({ ...base, now: at(6, 59), sentToday: 0, priority: 1 })).toEqual({ ok: false, reason: "quiet_hours" });
    expect(messageAllowed({ ...base, now: at(7, 0), sentToday: 0, priority: 1 })).toEqual({ ok: true });
    expect(messageAllowed({ ...base, now: at(20, 59), sentToday: 0, priority: 1 })).toEqual({ ok: true });
  });
  it("at the cap, low-priority messages are dropped but critical ones still go", () => {
    const now = at(10, 0);
    expect(messageAllowed({ ...base, now, sentToday: 8, priority: MESSAGE_PRIORITY.EOD_REMINDER })).toEqual({ ok: false, reason: "daily_cap" });
    expect(messageAllowed({ ...base, now, sentToday: 8, priority: MESSAGE_PRIORITY.STILL_ONLINE })).toEqual({ ok: false, reason: "daily_cap" });
    expect(messageAllowed({ ...base, now, sentToday: 8, priority: MESSAGE_PRIORITY.CHECK_IN })).toEqual({ ok: true });
    expect(messageAllowed({ ...base, now, sentToday: 8, priority: MESSAGE_PRIORITY.LATE_REMINDER })).toEqual({ ok: true });
  });
  it("nothing exceeds the hard ceiling", () => {
    expect(messageAllowed({ ...base, now: at(10, 0), sentToday: 12, priority: 1 })).toEqual({ ok: false, reason: "hard_ceiling" });
  });
  it("a normal day (4 messages) and the worst-case ladder (8) both fit under the default cap", () => {
    for (let sent = 0; sent < 8; sent++) {
      expect(messageAllowed({ ...base, now: at(10, 0), sentToday: sent, priority: 5 }).ok).toBe(true);
    }
  });
});
