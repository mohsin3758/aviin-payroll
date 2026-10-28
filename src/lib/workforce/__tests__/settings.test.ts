import { describe, it, expect } from "vitest";
import {
  DEFAULT_SETTINGS, MESSAGE_CAP_CEILING, resolveSettings, settingsLayerSchema, parseStoredLayer, timeToMinutes,
} from "../settings";

describe("owner-approved defaults", () => {
  it("encodes the decisions made so far", () => {
    expect(DEFAULT_SETTINGS.graceMinutes).toBe(15);
    expect(DEFAULT_SETTINGS.scheduledHoursPerDay).toBe(9);
    expect(DEFAULT_SETTINGS.breaksIncluded).toBe(true);
    expect(DEFAULT_SETTINGS.overtimePolicy).toBe("none"); // most IT clients don't pay overtime
    expect(DEFAULT_SETTINGS.correctionsPerMonth).toBe(2);
    expect(DEFAULT_SETTINGS.leaveNoticeHours).toBe(48);
    expect(DEFAULT_SETTINGS.dailyMessageCap).toBe(8);
  });
});

describe("resolveSettings: assignment -> project -> client -> company -> default", () => {
  it("falls back to defaults with no layers", () => {
    const { settings, sources } = resolveSettings([]);
    expect(settings).toEqual(DEFAULT_SETTINGS);
    expect(sources.graceMinutes).toBe("default");
  });

  it("the most specific layer wins, per key", () => {
    const { settings, sources } = resolveSettings([
      { scope: "assignment", values: { graceMinutes: 5 } },
      { scope: "project", values: { graceMinutes: 20, leaveNoticeHours: 24 } },
      { scope: "client", values: { overtimePolicy: "client_approved", leaveNoticeHours: 72 } },
      { scope: "company", values: { leaveNoticeHours: 48, shiftStart: "10:00" } },
    ]);
    expect(settings.graceMinutes).toBe(5);
    expect(sources.graceMinutes).toBe("assignment");
    expect(settings.leaveNoticeHours).toBe(24);
    expect(sources.leaveNoticeHours).toBe("project");
    expect(settings.overtimePolicy).toBe("client_approved");
    expect(sources.overtimePolicy).toBe("client");
    expect(settings.shiftStart).toBe("10:00");
    expect(sources.shiftStart).toBe("company");
    expect(sources.scheduledHoursPerDay).toBe("default");
  });

  it("an explicit null overrides a less specific value (no payable-hours ceiling)", () => {
    const { settings, sources } = resolveSettings([
      { scope: "project", values: { maxPayableHoursPerDay: null } },
      { scope: "client", values: { maxPayableHoursPerDay: 10 } },
    ]);
    expect(settings.maxPayableHoursPerDay).toBeNull();
    expect(sources.maxPayableHoursPerDay).toBe("project");
  });

  it("an unset (undefined) key does not override", () => {
    const { settings } = resolveSettings([
      { scope: "project", values: { graceMinutes: undefined } },
      { scope: "client", values: { graceMinutes: 30 } },
    ]);
    expect(settings.graceMinutes).toBe(30);
  });

  it("the message cap can never exceed the hard ceiling", () => {
    const { settings } = resolveSettings([{ scope: "client", values: { dailyMessageCap: 50 } as never }]);
    expect(settings.dailyMessageCap).toBe(MESSAGE_CAP_CEILING);
  });

  it("does not mutate the shared defaults", () => {
    resolveSettings([{ scope: "company", values: { graceMinutes: 1 } }]);
    expect(DEFAULT_SETTINGS.graceMinutes).toBe(15);
  });
});

describe("settingsLayerSchema", () => {
  it("accepts a valid partial override", () => {
    expect(settingsLayerSchema.safeParse({ graceMinutes: 10, shiftStart: "09:30", overtimePolicy: "auto" }).success).toBe(true);
    expect(settingsLayerSchema.safeParse({}).success).toBe(true);
  });
  it("rejects bad values and unknown keys", () => {
    expect(settingsLayerSchema.safeParse({ shiftStart: "9am" }).success).toBe(false);
    expect(settingsLayerSchema.safeParse({ shiftStart: "25:00" }).success).toBe(false);
    expect(settingsLayerSchema.safeParse({ overtimePolicy: "always" }).success).toBe(false);
    expect(settingsLayerSchema.safeParse({ graceMinutes: -1 }).success).toBe(false);
    expect(settingsLayerSchema.safeParse({ dailyMessageCap: MESSAGE_CAP_CEILING + 1 }).success).toBe(false);
    expect(settingsLayerSchema.safeParse({ halfDayHoursRatio: 1.5 }).success).toBe(false);
    expect(settingsLayerSchema.safeParse({ unknownSetting: 1 }).success).toBe(false);
  });
  it("allows null only where a ceiling can be removed", () => {
    expect(settingsLayerSchema.safeParse({ maxPayableHoursPerDay: null }).success).toBe(true);
    expect(settingsLayerSchema.safeParse({ graceMinutes: null }).success).toBe(false);
  });
});

describe("parseStoredLayer", () => {
  it("parses valid stored JSON", () => {
    expect(parseStoredLayer('{"graceMinutes":10}')).toEqual({ graceMinutes: 10 });
  });
  it("treats empty, corrupt or invalid rows as no overrides instead of crashing", () => {
    expect(parseStoredLayer(null)).toEqual({});
    expect(parseStoredLayer("")).toEqual({});
    expect(parseStoredLayer("{not json")).toEqual({});
    expect(parseStoredLayer('{"graceMinutes":"ten"}')).toEqual({});
  });
});

describe("timeToMinutes", () => {
  it("converts HH:MM", () => {
    expect(timeToMinutes("09:00")).toBe(540);
    expect(timeToMinutes("18:30")).toBe(1110);
    expect(timeToMinutes("00:00")).toBe(0);
  });
});
