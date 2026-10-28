/**
 * Time helpers for the workforce module. Timezones are modelled as fixed offsets from UTC (no
 * DST), which is exact for India and the other fixed-offset zones listed below. A client in a
 * DST zone is not supported yet and falls back to IST so nothing silently runs at a wrong hour.
 */
const OFFSETS: Record<string, number> = {
  "Asia/Kolkata": 330,
  "Asia/Calcutta": 330,
  UTC: 0,
  "Asia/Dubai": 240,
  "Asia/Singapore": 480,
  "Asia/Karachi": 300,
  "Asia/Dhaka": 360,
  "Asia/Kathmandu": 345,
};

export function tzOffsetMinutesFor(timezone: string | null | undefined): number {
  if (!timezone) return 330;
  return timezone in OFFSETS ? OFFSETS[timezone] : 330;
}

export function isSupportedTimezone(timezone: string): boolean {
  return timezone in OFFSETS;
}

/** The local calendar day of an instant, as UTC midnight of that day (same shape as istDateOnly). */
export function localDay(now: Date, tzOffsetMinutes: number): Date {
  const shifted = new Date(now.getTime() + tzOffsetMinutes * 60_000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

/** "YYYY-MM-DD" for a local-day Date (as returned by localDay). */
export function dateKey(day: Date): string {
  return day.toISOString().slice(0, 10);
}

/** Weekday (0=Sunday..6) of a local-day Date. */
export function weekdayOf(day: Date): number {
  return day.getUTCDay();
}

/** The real instant at which a local "HH:MM" occurs on a local-day Date. */
export function instantAt(day: Date, hhmm: string, tzOffsetMinutes: number): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(day.getTime() + (h * 60 + m - tzOffsetMinutes) * 60_000);
}

export function addDays(day: Date, n: number): Date {
  return new Date(day.getTime() + n * 86_400_000);
}
