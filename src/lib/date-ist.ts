const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * Returns the given instant's calendar day in India Standard Time, normalized to UTC
 * midnight of that day — the same representation `Attendance.date` is stored in. Using
 * raw `setUTCHours(0,0,0,0)` on the instant itself misattributes any punch/record made
 * between 00:00–05:29 IST to the previous calendar day, since UTC midnight lags IST
 * midnight by 5.5 hours. This company is India-only, so "today" always means the IST day.
 */
export function istDateOnly(date: Date = new Date()): Date {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}
