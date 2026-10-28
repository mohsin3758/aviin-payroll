import { z } from "zod";

/**
 * Configurable rules for the Contractor Workforce module (docs/CONTRACTOR_MONITORING_SPEC.md §7).
 * Nothing here is a hard-coded business, legal or contractual rule: every value below is only a
 * DEFAULT that a company, client, project or assignment can override.
 */
export type OvertimePolicy = "none" | "client_approved" | "auto";

export interface WorkforceSettings {
  /** Local wall-clock times, "HH:MM". Shifts that cross midnight are not supported yet. */
  shiftStart: string;
  shiftEnd: string;
  /** The standard working day (owner decision: 9). */
  scheduledHoursPerDay: number;
  /** true = hours are check-in-to-check-out including breaks (owner decision). */
  breaksIncluded: boolean;
  /** Check-in later than shiftStart + this many minutes is "late" (owner decision: 15). */
  graceMinutes: number;
  /** Check-in later than shiftStart + this many minutes is at best a half-day. */
  halfDayAfterMinutes: number;
  /** Working less than this share of scheduledHoursPerDay is a half-day. */
  halfDayHoursRatio: number;
  /** Working fewer hours than this is an absence. */
  absentBelowHours: number;
  /** Local times of the "still online?" pulses. */
  pulseTimes: string[];
  /** This many unanswered pulses (with none excused) makes the day a half-day. */
  pulseMissLimit: number;
  /** A shortfall within this many minutes is ignored; beyond it raises a review exception. */
  shortHoursToleranceMinutes: number;
  overtimePolicy: OvertimePolicy;
  overtimeStartsAfterHours: number;
  /** Ceiling on payable hours per day, overtime included; null = no ceiling. */
  maxPayableHoursPerDay: number | null;
  overtimeRateMultiplier: number;
  /** "Forgot to check in" corrections allowed per contractor per month (owner decision: 2). */
  correctionsPerMonth: number;
  /** Planned leave must be requested this many hours ahead (owner decision: 48, per client). */
  leaveNoticeHours: number;
  /** This many late days in a month opens a coordinator review (a task only, never a deduction). */
  lateReviewCount: number;
  /** Max automated messages to one contractor per day (spec §6: default 8, ceiling 12). */
  dailyMessageCap: number;
  /** Minutes before shift start that the check-in prompt goes out. */
  checkInPromptMinutesBefore: number;
  /** Escalation ladder, all in minutes AFTER shift start (spec §8.1). */
  lateReminderAfterMinutes: number;
  finalReminderAfterMinutes: number;
  callTaskAfterMinutes: number;
  clientNoticeAfterMinutes: number;
  /** A "still online" pulse unanswered this long after it was sent counts as missed. */
  pulseExpiryMinutes: number;
  /** End-of-day prompt goes out this many minutes before shift end; reminders follow after the listed minutes. */
  eodPromptMinutesBeforeEnd: number;
  eodReminderAfterMinutes: number[];
  /** How the contractor gives the daily update. */
  eodMode: "web_link" | "whatsapp_flow" | "free_text";
  /** No automated message to a contractor between these local times. */
  quietHoursStart: string;
  quietHoursEnd: string;
  /** Local time the daily client digest goes out. */
  clientDigestTime: string;
  /** Local time (next day) a finished day auto-closes if nothing is still open for it. */
  dayCloseTime: string;
}

export const DEFAULT_SETTINGS: WorkforceSettings = {
  shiftStart: "09:00",
  shiftEnd: "18:00",
  scheduledHoursPerDay: 9,
  breaksIncluded: true,
  graceMinutes: 15,
  halfDayAfterMinutes: 120,
  halfDayHoursRatio: 0.5,
  absentBelowHours: 4,
  pulseTimes: ["13:00", "16:00"],
  pulseMissLimit: 2,
  shortHoursToleranceMinutes: 30,
  overtimePolicy: "none",
  overtimeStartsAfterHours: 9,
  maxPayableHoursPerDay: null,
  overtimeRateMultiplier: 1,
  correctionsPerMonth: 2,
  leaveNoticeHours: 48,
  lateReviewCount: 3,
  dailyMessageCap: 8,
  checkInPromptMinutesBefore: 15,
  lateReminderAfterMinutes: 15,
  finalReminderAfterMinutes: 30,
  callTaskAfterMinutes: 45,
  clientNoticeAfterMinutes: 90,
  pulseExpiryMinutes: 30,
  eodPromptMinutesBeforeEnd: 30,
  eodReminderAfterMinutes: [30, 60],
  eodMode: "web_link",
  quietHoursStart: "21:00",
  quietHoursEnd: "07:00",
  clientDigestTime: "19:00",
  dayCloseTime: "10:00",
};

/** Hard ceiling nothing may exceed, whatever a client or project configures (spec §6). */
export const MESSAGE_CAP_CEILING = 12;

export type SettingsKey = keyof WorkforceSettings;
export type SettingsLayer = Partial<WorkforceSettings>;
export type SettingsScope = "assignment" | "project" | "client" | "company";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be a time like 09:00");

/** Validates ONE override layer. Strict: unknown keys are rejected rather than silently stored. */
export const settingsLayerSchema = z
  .object({
    shiftStart: hhmm,
    shiftEnd: hhmm,
    scheduledHoursPerDay: z.number().positive().max(24),
    breaksIncluded: z.boolean(),
    graceMinutes: z.number().int().min(0).max(240),
    halfDayAfterMinutes: z.number().int().min(0).max(720),
    halfDayHoursRatio: z.number().min(0).max(1),
    absentBelowHours: z.number().min(0).max(24),
    pulseTimes: z.array(hhmm).max(6),
    pulseMissLimit: z.number().int().min(1).max(6),
    shortHoursToleranceMinutes: z.number().int().min(0).max(240),
    overtimePolicy: z.enum(["none", "client_approved", "auto"]),
    overtimeStartsAfterHours: z.number().positive().max(24),
    maxPayableHoursPerDay: z.number().positive().max(24).nullable(),
    overtimeRateMultiplier: z.number().min(1).max(5),
    correctionsPerMonth: z.number().int().min(0).max(31),
    leaveNoticeHours: z.number().int().min(0).max(24 * 60),
    lateReviewCount: z.number().int().min(1).max(31),
    dailyMessageCap: z.number().int().min(1).max(MESSAGE_CAP_CEILING),
    checkInPromptMinutesBefore: z.number().int().min(0).max(240),
    lateReminderAfterMinutes: z.number().int().min(0).max(600),
    finalReminderAfterMinutes: z.number().int().min(0).max(600),
    callTaskAfterMinutes: z.number().int().min(0).max(600),
    clientNoticeAfterMinutes: z.number().int().min(0).max(600),
    pulseExpiryMinutes: z.number().int().min(5).max(240),
    eodPromptMinutesBeforeEnd: z.number().int().min(0).max(240),
    eodReminderAfterMinutes: z.array(z.number().int().min(5).max(480)).max(4),
    eodMode: z.enum(["web_link", "whatsapp_flow", "free_text"]),
    quietHoursStart: hhmm,
    quietHoursEnd: hhmm,
    clientDigestTime: hhmm,
    dayCloseTime: hhmm,
  })
  .partial()
  .strict();

export interface SettingsChainEntry {
  scope: SettingsScope;
  values: SettingsLayer;
}

export interface ResolvedSettings {
  settings: WorkforceSettings;
  /** Where each effective value came from, so the UI can show "inherited from client". */
  sources: Record<SettingsKey, SettingsScope | "default">;
}

/**
 * Per-key resolution. `chain` is ordered MOST specific first (assignment, project, client,
 * company); the first layer that sets a key wins. `undefined` means "not set here"; `null` is a
 * real value (e.g. maxPayableHoursPerDay: no ceiling) and does override a less specific layer.
 */
export function resolveSettings(chain: SettingsChainEntry[]): ResolvedSettings {
  const settings = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  const sources = {} as Record<string, SettingsScope | "default">;
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    sources[key] = "default";
    for (const layer of chain) {
      const value = (layer.values as Record<string, unknown>)[key];
      if (value !== undefined) {
        settings[key] = value;
        sources[key] = layer.scope;
        break;
      }
    }
  }
  // Whatever any layer says, the message cap can never exceed the hard ceiling.
  settings.dailyMessageCap = Math.min(settings.dailyMessageCap as number, MESSAGE_CAP_CEILING);
  return { settings: settings as unknown as WorkforceSettings, sources: sources as ResolvedSettings["sources"] };
}

/** Parses the JSON stored in SettingsPolicy.values; a corrupt row yields no overrides, never a crash. */
export function parseStoredLayer(raw: string | null | undefined): SettingsLayer {
  if (!raw) return {};
  try {
    const parsed = settingsLayerSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export function timeToMinutes(hhmmValue: string): number {
  const [h, m] = hhmmValue.split(":").map(Number);
  return h * 60 + m;
}
