import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS, type WorkforceSettings } from "../settings";
import {
  evaluateDay, summarizeMonth, correctionAllowance, checkLeaveNotice, localMinutesOfDay, spanHours,
  type DayInput,
} from "../attendance-rules";

const IST = 330;
/** An IST wall-clock time on Tue 3 Nov 2026, as a real instant. */
const at = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 3, h, m) - IST * 60_000);

function day(over: Omit<Partial<DayInput>, "settings"> & { settings?: Partial<WorkforceSettings> } = {}): DayInput {
  const { settings, ...rest } = over;
  return {
    settings: { ...DEFAULT_SETTINGS, ...settings },
    tzOffsetMinutes: IST,
    dayClosed: true,
    isHoliday: false,
    isWeeklyOff: false,
    leave: "none",
    checkInAt: at(9, 0),
    hoursWorked: 9,
    pulsesSent: 2,
    pulsesAnswered: 2,
    ...rest,
  };
}

describe("localMinutesOfDay / spanHours", () => {
  it("converts to local minutes across the UTC midnight boundary", () => {
    expect(localMinutesOfDay(new Date(Date.UTC(2026, 10, 2, 19, 0)), IST)).toBe(30); // 00:30 IST
    expect(localMinutesOfDay(at(9, 15), IST)).toBe(9 * 60 + 15);
  });
  it("computes check-in to check-out, or null when impossible", () => {
    expect(spanHours(at(9, 0), at(18, 30))).toBe(9.5);
    expect(spanHours(null, at(18, 0))).toBeNull();
    expect(spanHours(at(18, 0), at(9, 0))).toBeNull();
  });
});

describe("late / half-day / absent by check-in time (grace 15 min)", () => {
  it("on time is present", () => {
    const r = evaluateDay(day());
    expect(r.state).toBe("present");
    expect(r.workedFraction).toBe(1);
    expect(r.unpaidFraction).toBe(0);
    expect(r.flags).toEqual([]);
  });
  it("exactly at the grace limit is still present; one minute over is late", () => {
    expect(evaluateDay(day({ checkInAt: at(9, 15) })).state).toBe("present");
    const late = evaluateDay(day({ checkInAt: at(9, 16) }));
    expect(late.state).toBe("late");
    expect(late.lateMinutes).toBe(16);
    expect(late.workedFraction).toBe(1); // late is still a full worked day
  });
  it("up to 2 hours late is late; beyond that is a half-day", () => {
    expect(evaluateDay(day({ checkInAt: at(11, 0), hoursWorked: 7 })).state).toBe("late");
    const half = evaluateDay(day({ checkInAt: at(11, 1), hoursWorked: 7 }));
    expect(half.state).toBe("half_day");
    expect(half.unpaidFraction).toBe(0.5);
    expect(half.workedFraction).toBe(0.5);
  });
  it("checking in after more than half the shift is an absence", () => {
    expect(evaluateDay(day({ checkInAt: at(13, 30), hoursWorked: 4.5 })).state).toBe("half_day");
    const absent = evaluateDay(day({ checkInAt: at(13, 31), hoursWorked: 4.4 }));
    expect(absent.state).toBe("absent");
    expect(absent.unpaidFraction).toBe(1);
    expect(absent.workedFraction).toBe(0);
  });
  it("checking in before shift start is simply on time", () => {
    const r = evaluateDay(day({ checkInAt: at(8, 30) }));
    expect(r.state).toBe("present");
    expect(r.lateMinutes).toBe(0);
  });
  it("respects per-client settings (e.g. grace 0, shift 10:00)", () => {
    const r = evaluateDay(day({ settings: { shiftStart: "10:00", graceMinutes: 0 }, checkInAt: at(10, 1) }));
    expect(r.state).toBe("late");
  });
});

describe("hours-based rules apply only once the day is closed", () => {
  it("full day is present with no flags", () => {
    expect(evaluateDay(day({ hoursWorked: 9 })).flags).toEqual([]);
  });
  it("a shortfall inside the 30-minute tolerance is ignored", () => {
    expect(evaluateDay(day({ hoursWorked: 8.5 })).flags).toEqual([]);
    const short = evaluateDay(day({ hoursWorked: 8.4 }));
    expect(short.flags).toContain("short_hours");
    expect(short.state).toBe("present"); // never changes the day's state or pay by itself
    expect(short.unpaidFraction).toBe(0);
  });
  it("under half the day is a half-day; under 4 hours is absent", () => {
    expect(evaluateDay(day({ hoursWorked: 4.4 })).state).toBe("half_day");
    expect(evaluateDay(day({ hoursWorked: 4 })).state).toBe("half_day");
    expect(evaluateDay(day({ hoursWorked: 3.9 })).state).toBe("absent");
  });
  it("an open day ignores partial hours", () => {
    const r = evaluateDay(day({ dayClosed: false, hoursWorked: 2 }));
    expect(r.state).toBe("present");
    expect(r.payableHours).toBe(0);
  });
  it("a closed day with a check-in but no hours is flagged, not guessed", () => {
    const r = evaluateDay(day({ hoursWorked: null }));
    expect(r.flags).toContain("missing_checkout");
    expect(r.state).toBe("present");
  });
});

describe("missed 'still online' pulses", () => {
  it("two unexplained misses make a half-day", () => {
    const r = evaluateDay(day({ pulsesSent: 3, pulsesAnswered: 1 }));
    expect(r.state).toBe("half_day");
  });
  it("an excused miss does not count", () => {
    expect(evaluateDay(day({ pulsesSent: 3, pulsesAnswered: 1, pulsesExcused: 1 })).state).toBe("present");
  });
  it("one miss is never enough", () => {
    expect(evaluateDay(day({ pulsesSent: 3, pulsesAnswered: 2 })).state).toBe("present");
  });
  it("fewer pulses sent than the limit cannot trigger it", () => {
    expect(evaluateDay(day({ pulsesSent: 1, pulsesAnswered: 0 })).state).toBe("present");
  });
});

describe("no check-in, holidays and leave", () => {
  it("is pending while the day is open and absent once closed", () => {
    expect(evaluateDay(day({ checkInAt: null, dayClosed: false, hoursWorked: null })).state).toBe("pending");
    const r = evaluateDay(day({ checkInAt: null, hoursWorked: null }));
    expect(r.state).toBe("absent");
    expect(r.unpaidFraction).toBe(1);
  });
  it("holiday, weekly off and leave are not absences", () => {
    expect(evaluateDay(day({ checkInAt: null, hoursWorked: null, isHoliday: true })).state).toBe("holiday");
    expect(evaluateDay(day({ checkInAt: null, hoursWorked: null, isWeeklyOff: true })).state).toBe("weekly_off");
    const paid = evaluateDay(day({ checkInAt: null, hoursWorked: null, leave: "paid" }));
    expect(paid.state).toBe("leave");
    expect(paid.unpaidFraction).toBe(0);
    const unpaid = evaluateDay(day({ checkInAt: null, hoursWorked: null, leave: "unpaid" }));
    expect(unpaid.unpaidFraction).toBe(1);
  });
  it("none of them earn a 'day worked' on a per-day deal", () => {
    for (const over of [{ isHoliday: true }, { isWeeklyOff: true }, { leave: "paid" as const }]) {
      expect(evaluateDay(day({ checkInAt: null, hoursWorked: null, ...over })).workedFraction).toBe(0);
    }
  });
  it("working on a holiday is evaluated normally and flagged for review", () => {
    const r = evaluateDay(day({ isHoliday: true }));
    expect(r.state).toBe("present");
    expect(r.workedFraction).toBe(1);
    expect(r.flags).toContain("worked_on_non_working_day");
  });
  it("holiday takes precedence over leave when there is no check-in", () => {
    expect(evaluateDay(day({ checkInAt: null, hoursWorked: null, isHoliday: true, leave: "paid" })).state).toBe("holiday");
  });
});

describe("overtime (client policy, default unpaid)", () => {
  it("exactly 9 hours is no overtime", () => {
    const r = evaluateDay(day({ hoursWorked: 9 }));
    expect(r.overtimeHours).toBe(0);
    expect(r.payableHours).toBe(9);
  });
  it("policy none: recorded but not paid", () => {
    const r = evaluateDay(day({ hoursWorked: 11 }));
    expect(r.overtimeHours).toBe(2);
    expect(r.payableOvertimeHours).toBe(0);
    expect(r.payableHours).toBe(9);
    expect(r.flags).toContain("overtime_unpaid_by_policy");
  });
  it("policy auto: all overtime paid", () => {
    const r = evaluateDay(day({ hoursWorked: 11, settings: { overtimePolicy: "auto" } }));
    expect(r.payableOvertimeHours).toBe(2);
    expect(r.payableHours).toBe(11);
    expect(r.flags).not.toContain("overtime_unpaid_by_policy");
  });
  it("policy client_approved: only the approved part is paid, the rest is pending", () => {
    const settings = { overtimePolicy: "client_approved" as const };
    const some = evaluateDay(day({ hoursWorked: 11, settings, approvedOvertimeHours: 1 }));
    expect(some.payableOvertimeHours).toBe(1);
    expect(some.payableHours).toBe(10);
    expect(some.flags).toContain("overtime_pending_approval");
    const none = evaluateDay(day({ hoursWorked: 11, settings }));
    expect(none.payableOvertimeHours).toBe(0);
    const all = evaluateDay(day({ hoursWorked: 11, settings, approvedOvertimeHours: 5 }));
    expect(all.payableOvertimeHours).toBe(2); // approval beyond actual overtime is capped
    expect(all.flags).not.toContain("overtime_pending_approval");
  });
  it("a payable-hours ceiling applies to regular + overtime", () => {
    const r = evaluateDay(day({ hoursWorked: 12, settings: { overtimePolicy: "auto", maxPayableHoursPerDay: 10 } }));
    expect(r.payableHours).toBe(10);
  });
  it("payable hours do not depend on the attendance state (hourly deals pay worked hours)", () => {
    const r = evaluateDay(day({ hoursWorked: 3 }));
    expect(r.state).toBe("absent");
    expect(r.payableHours).toBe(3);
  });
});

describe("explanations", () => {
  it("always gives plain-language reasons", () => {
    expect(evaluateDay(day()).reasons.length).toBeGreaterThan(0);
    expect(evaluateDay(day({ checkInAt: at(9, 40) })).reasons.join(" ")).toMatch(/40 min after shift start/);
  });
});

describe("summarizeMonth", () => {
  const settings = { lateReviewCount: 3 };
  it("rolls days up into the inputs the pay pre-fill needs", () => {
    const days = [
      evaluateDay(day()), // present, 9 h
      evaluateDay(day({ checkInAt: at(9, 30) })), // late, 9 h
      evaluateDay(day({ checkInAt: at(11, 30), hoursWorked: 6.5 })), // half-day, 6.5 h
      evaluateDay(day({ checkInAt: null, hoursWorked: null })), // absent
      evaluateDay(day({ checkInAt: null, hoursWorked: null, isHoliday: true })), // holiday
      evaluateDay(day({ checkInAt: null, hoursWorked: null, leave: "unpaid" })), // unpaid leave
    ];
    const m = summarizeMonth(days, settings);
    expect(m.counts).toMatchObject({ present: 1, late: 1, half_day: 1, absent: 1, holiday: 1, leave: 1 });
    expect(m.workedDays).toBe(2.5); // 1 + 1 + 0.5
    expect(m.suggestedUnpaidDays).toBe(2.5); // 0.5 half + 1 absent + 1 unpaid leave
    expect(m.payableHours).toBe(24.5); // 9 + 9 + 6.5
    expect(m.pendingDays).toBe(0);
  });
  it("opens a late review at the threshold, never a deduction", () => {
    const late = (n: number) => Array.from({ length: n }, () => evaluateDay(day({ checkInAt: at(9, 30) })));
    expect(summarizeMonth(late(2), settings).needsLateReview).toBe(false);
    expect(summarizeMonth(late(3), settings).needsLateReview).toBe(true);
    expect(summarizeMonth(late(3), settings).suggestedUnpaidDays).toBe(0);
  });
  it("reports pending days so the month cannot lock early", () => {
    const m = summarizeMonth([evaluateDay(day({ checkInAt: null, hoursWorked: null, dayClosed: false }))], settings);
    expect(m.pendingDays).toBe(1);
  });
  it("counts flags", () => {
    const m = summarizeMonth([evaluateDay(day({ hoursWorked: 11 })), evaluateDay(day({ hoursWorked: 10 }))], settings);
    expect(m.flagCounts.overtime_unpaid_by_policy).toBe(2);
    expect(m.overtimeHours).toBe(3);
    expect(m.payableOvertimeHours).toBe(0);
  });
});

describe("correctionAllowance (2 per month)", () => {
  it("allows the first two, then requires an admin override", () => {
    expect(correctionAllowance(0, 2)).toEqual({ allowed: true, remaining: 2, requiresAdminOverride: false });
    expect(correctionAllowance(1, 2)).toEqual({ allowed: true, remaining: 1, requiresAdminOverride: false });
    expect(correctionAllowance(2, 2)).toEqual({ allowed: false, remaining: 0, requiresAdminOverride: true });
    expect(correctionAllowance(5, 2).requiresAdminOverride).toBe(true);
  });
  it("a limit of 0 means every correction needs an admin", () => {
    expect(correctionAllowance(0, 0).requiresAdminOverride).toBe(true);
  });
});

describe("checkLeaveNotice (48 h default)", () => {
  const leaveStart = new Date("2026-11-10T03:30:00.000Z"); // 09:00 IST
  const hoursBefore = (h: number) => new Date(leaveStart.getTime() - h * 3_600_000);
  it("accepts exactly the required notice and rejects less", () => {
    expect(checkLeaveNotice({ requestedAt: hoursBefore(48), leaveStart, noticeHours: 48 }).ok).toBe(true);
    const short = checkLeaveNotice({ requestedAt: hoursBefore(47.5), leaveStart, noticeHours: 48 });
    expect(short.ok).toBe(false);
    expect(short.noticeGivenHours).toBe(47.5);
  });
  it("honours a per-client notice period", () => {
    expect(checkLeaveNotice({ requestedAt: hoursBefore(24), leaveStart, noticeHours: 24 }).ok).toBe(true);
    expect(checkLeaveNotice({ requestedAt: hoursBefore(72), leaveStart, noticeHours: 96 }).ok).toBe(false);
  });
  it("same-day sick leave is allowed but needs a reason", () => {
    const r = checkLeaveNotice({ requestedAt: hoursBefore(1), leaveStart, noticeHours: 48, sameDaySick: true });
    expect(r).toMatchObject({ ok: true, requiresReason: true });
  });
  it("a retroactive request is not 'notice' at all", () => {
    const r = checkLeaveNotice({ requestedAt: new Date(leaveStart.getTime() + 3_600_000), leaveStart, noticeHours: 48 });
    expect(r.ok).toBe(false);
    expect(r.noticeGivenHours).toBeLessThan(0);
  });
});
