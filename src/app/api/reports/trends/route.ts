import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePayrollFeature } from "@/lib/payroll-access";
import { handleApiError } from "@/lib/api-utils";

const DEFAULT_MONTHS = 6;
const MAX_MONTHS = 12;

// GET /api/reports/trends?months=6 — a small time-series endpoint, kept separate from the
// main /api/reports switch (which returns one period's report, not a series). Deliberately
// excludes a headcount-over-time line: there's no EmployeeStatusHistory-style table in this
// schema, so a historical headcount can't be reconstructed accurately (same reason the
// headcount report itself is current-state-only) — only exits and payroll cost are charted,
// since both ARE historically accurate (Employee.dateOfExit, PayrollRun figures).
export async function GET(request: NextRequest) {
  try {
    await requirePayrollFeature(request, ["admin", "hr", "manager"], "view_reports");
    const { searchParams } = new URL(request.url);
    const monthsParam = searchParams.get("months");
    const months = Math.min(MAX_MONTHS, Math.max(1, parseInt(monthsParam ?? String(DEFAULT_MONTHS), 10) || DEFAULT_MONTHS));

    const now = new Date();
    const startIndex = now.getFullYear() * 12 + now.getMonth() - (months - 1);
    const pairs: { month: number; year: number }[] = [];
    for (let i = 0; i < months; i++) {
      const idx = startIndex + i;
      pairs.push({ month: (idx % 12) + 1, year: Math.floor(idx / 12) });
    }

    const rangeStart = new Date(Date.UTC(pairs[0].year, pairs[0].month - 1, 1));

    const [runs, exitedEmployees] = await Promise.all([
      db.payrollRun.findMany({
        where: { runType: "regular", OR: pairs.map((p) => ({ month: p.month, year: p.year })) },
        select: { month: true, year: true, totalGrossSalary: true, totalNetSalary: true },
      }),
      db.employee.findMany({
        where: { dateOfExit: { gte: rangeStart } },
        select: { dateOfExit: true },
      }),
    ]);

    const runsByKey = new Map(runs.map((r) => [`${r.year}-${r.month}`, r]));
    const exitsByKey = new Map<string, number>();
    for (const e of exitedEmployees) {
      if (!e.dateOfExit) continue;
      const key = `${e.dateOfExit.getUTCFullYear()}-${e.dateOfExit.getUTCMonth() + 1}`;
      exitsByKey.set(key, (exitsByKey.get(key) ?? 0) + 1);
    }

    const data = pairs.map((p) => {
      const key = `${p.year}-${p.month}`;
      const run = runsByKey.get(key);
      return {
        month: p.month,
        year: p.year,
        exits: exitsByKey.get(key) ?? 0,
        grossPayroll: run?.totalGrossSalary ?? 0,
        netPayroll: run?.totalNetSalary ?? 0,
      };
    });

    return NextResponse.json({ data: { months: data } });
  } catch (error) {
    return handleApiError(error, "fetch report trends");
  }
}
