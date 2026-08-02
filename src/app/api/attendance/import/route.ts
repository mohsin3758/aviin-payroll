import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError, handleApiError, getDefaultCompanyId } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

const VALID_STATUSES = ["present", "absent", "half-day", "holiday", "weekly-off"];

interface CsvRow {
  employeeCode?: string;
  date?: string;
  status?: string;
  punchIn?: string;
  punchOut?: string;
  notes?: string;
}

// POST /api/attendance/import — admin/hr only. Bulk-imports attendance from a CSV with columns
// employeeCode,date,status[,punchIn,punchOut,notes]. date is YYYY-MM-DD; punchIn/punchOut are
// optional HH:MM (24h) times on that date. Each (employeeCode, date) upserts, overwriting any
// existing record for that day. Unlike the interactive attendance UI, this does NOT adjust leave
// balances for half-day status — bulk/historical imports are expected to reconcile leave
// balances separately, not trigger the same live side effects as a single manual edit.
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return apiError("file is required", 400);
    }

    const text = await file.text();
    const parsed = Papa.parse<CsvRow>(text, { header: true, skipEmptyLines: true });
    if (parsed.errors.length > 0) {
      return apiError(`CSV parse error: ${parsed.errors[0].message} (row ${parsed.errors[0].row})`, 400);
    }

    const companyId = await getDefaultCompanyId();
    const employees = await db.employee.findMany({ where: { companyId }, select: { id: true, employeeCode: true } });
    const employeeByCode = new Map(employees.map((e) => [e.employeeCode, e.id]));

    const results: { row: number; status: "imported" | "skipped"; reason?: string }[] = [];

    for (let i = 0; i < parsed.data.length; i++) {
      const row = parsed.data[i];
      const rowNum = i + 2; // account for header row + 1-index

      if (!row.employeeCode || !row.date || !row.status) {
        results.push({ row: rowNum, status: "skipped", reason: "Missing employeeCode, date, or status" });
        continue;
      }
      const employeeId = employeeByCode.get(row.employeeCode.trim());
      if (!employeeId) {
        results.push({ row: rowNum, status: "skipped", reason: `Unknown employeeCode: ${row.employeeCode}` });
        continue;
      }
      const status = row.status.trim().toLowerCase();
      if (!VALID_STATUSES.includes(status)) {
        results.push({ row: rowNum, status: "skipped", reason: `Invalid status: ${row.status}` });
        continue;
      }
      const date = new Date(`${row.date.trim()}T00:00:00.000Z`);
      if (isNaN(date.getTime())) {
        results.push({ row: rowNum, status: "skipped", reason: `Invalid date: ${row.date}` });
        continue;
      }

      const punchIn = row.punchIn?.trim() ? new Date(`${row.date.trim()}T${row.punchIn.trim()}:00.000Z`) : null;
      const punchOut = row.punchOut?.trim() ? new Date(`${row.date.trim()}T${row.punchOut.trim()}:00.000Z`) : null;
      const totalHours = punchIn && punchOut ? Math.max(0, Math.round(((punchOut.getTime() - punchIn.getTime()) / (1000 * 60 * 60)) * 100) / 100) : null;
      // Overwrites, so the sessions array is reset to match — never leaves a stale
      // multi-session history behind that no longer agrees with the imported punchIn/punchOut.
      const punchSessions = punchIn ? JSON.stringify([{ punchIn: punchIn.toISOString(), punchOut: punchOut ? punchOut.toISOString() : null, punchInMethod: "manual", punchOutMethod: punchOut ? "manual" : null }]) : JSON.stringify([]);

      await db.attendance.upsert({
        where: { employeeId_date: { employeeId, date } },
        create: { employeeId, date, status, punchIn, punchOut, totalHours, punchSessions, notes: row.notes?.trim() || null, punchInMethod: punchIn ? "manual" : null, punchOutMethod: punchOut ? "manual" : null },
        update: { status, punchIn, punchOut, totalHours, punchSessions, notes: row.notes?.trim() || null },
      });
      results.push({ row: rowNum, status: "imported" });
    }

    const imported = results.filter((r) => r.status === "imported").length;
    const skipped = results.filter((r) => r.status === "skipped");

    await logAudit({ session, action: "create", entity: "Attendance", details: { csvImport: true, totalRows: parsed.data.length, imported, skipped: skipped.length } });

    return NextResponse.json({ data: { totalRows: parsed.data.length, imported, skipped: skipped.length, errors: skipped } });
  } catch (error) {
    return handleApiError(error, "import attendance CSV");
  }
}
