import { STANDARD_HOURS_PER_DAY } from "@/lib/payroll/engine";

export interface AttendanceRowInput {
  date: Date;
  status: string;
  totalHours: number | null;
}

export interface MonthlyAttendanceResult {
  presentDays: number;
  absentDays: number;
  halfDays: number;
  overtimeHours: number;
}

// Extracted from src/app/api/payroll/route.ts's inline day-by-day loop so payroll and the
// Attendance report can never disagree on what "present days" means — this IS the definition
// employees are actually paid on. (A separate, simpler presentDays calculation also exists in
// src/lib/payroll/salary-slip.ts for an individual's own slip; that one is intentionally left
// alone — different consumer, out of scope here.)
//
// Company holidays and weekly-off days are auto-credited as present when there's no explicit
// attendance record for that day; an explicit record (e.g. "absent") always takes precedence.
export function computeMonthlyAttendance(
  attendanceRows: AttendanceRowInput[],
  daysInMonth: number,
  month: number,
  year: number,
  holidayDateKeys: Set<string>,
  weeklyOffDays: number[]
): MonthlyAttendanceResult {
  const attendanceByDate = new Map(attendanceRows.map((record) => [record.date.toISOString().slice(0, 10), record]));

  let presentDays = 0;
  let absentDays = 0;
  let halfDays = 0;
  let overtimeHours = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(Date.UTC(year, month - 1, day));
    const dateKey = dateObj.toISOString().slice(0, 10);
    const record = attendanceByDate.get(dateKey);

    if (record) {
      if (record.status === "present" || record.status === "holiday" || record.status === "weekly-off") {
        presentDays += 1;
      } else if (record.status === "half-day") {
        presentDays += 0.5;
        halfDays += 1;
      } else {
        absentDays += 1;
      }
      if (record.totalHours && record.totalHours > STANDARD_HOURS_PER_DAY) {
        overtimeHours += record.totalHours - STANDARD_HOURS_PER_DAY;
      }
    } else if (holidayDateKeys.has(dateKey) || weeklyOffDays.includes(dateObj.getUTCDay())) {
      presentDays += 1;
    } else {
      absentDays += 1;
    }
  }

  return { presentDays, absentDays, halfDays, overtimeHours };
}
