import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getMonthName } from "@/lib/payroll/engine";
import { enumerateMonthRange, InvalidRangeError } from "@/lib/payroll/report-range";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import { requireRole } from "@/lib/auth";
import { apiError, handleApiError, toDate } from "@/lib/api-utils";
import { ACTIVE_EMPLOYEE_WHERE } from "@/lib/employee-scope";
import { reportQuerySchema, type ReportType, type ReportFormat } from "@/lib/validations/report";

const EMPLOYEE_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  employeeCode: true,
  designation: true,
  department: true,
  state: true,
  panNumber: true,
  pfApplicable: true,
  esiApplicable: true,
  taxRegime: true,
} as const;

interface EmployeeSelectShape {
  id: string;
  firstName: string;
  lastName: string | null;
  employeeCode: string;
  designation: string;
  department: string;
  state: string;
  panNumber: string | null;
  pfApplicable: boolean;
  esiApplicable: boolean;
  taxRegime: string;
}

// The minimal shape the report switch below actually reads — both a single PayrollRun's
// details (Prisma's wider return type) and the multi-month aggregated rows satisfy this
// structurally, so the switch logic downstream never needs to know which one it got.
interface ReportDetailRow {
  basic: number;
  dearnessAllowance: number;
  employeePF: number;
  employerPF: number;
  employeeESI: number;
  employerESI: number;
  tds: number;
  professionalTax: number;
  lwf: number;
  grossSalary: number;
  netSalary: number;
  totalDeductions: number;
  totalEarnings: number;
  ctc: number;
  employee: EmployeeSelectShape;
}

/** Sums PayrollDetail rows for the same employee across every run in a multi-month range.
 * Only sums what actually exists — a joiner/leaver mid-range, or a month never processed,
 * simply contributes nothing for that month, never a synthesized/estimated figure. Filtering
 * flags (pfApplicable etc.) come from each row's `.employee` include, which is always the
 * employee's CURRENT value — identical to how the single-month path already behaves (Prisma's
 * include has no historical snapshot either), so this is not a new inconsistency. */
function aggregateDetailsByEmployee(
  allDetails: Array<{ employeeId: string } & ReportDetailRow>
): ReportDetailRow[] {
  const byEmployee = new Map<string, ReportDetailRow>();
  for (const d of allDetails) {
    const existing = byEmployee.get(d.employeeId);
    if (existing) {
      existing.basic += d.basic;
      existing.dearnessAllowance += d.dearnessAllowance;
      existing.employeePF += d.employeePF;
      existing.employerPF += d.employerPF;
      existing.employeeESI += d.employeeESI;
      existing.employerESI += d.employerESI;
      existing.tds += d.tds;
      existing.professionalTax += d.professionalTax;
      existing.lwf += d.lwf;
      existing.grossSalary += d.grossSalary;
      existing.netSalary += d.netSalary;
      existing.totalDeductions += d.totalDeductions;
      existing.totalEarnings += d.totalEarnings;
      existing.ctc += d.ctc;
    } else {
      byEmployee.set(d.employeeId, {
        employee: d.employee,
        basic: d.basic,
        dearnessAllowance: d.dearnessAllowance,
        employeePF: d.employeePF,
        employerPF: d.employerPF,
        employeeESI: d.employeeESI,
        employerESI: d.employerESI,
        tds: d.tds,
        professionalTax: d.professionalTax,
        lwf: d.lwf,
        grossSalary: d.grossSalary,
        netSalary: d.netSalary,
        totalDeductions: d.totalDeductions,
        totalEarnings: d.totalEarnings,
        ctc: d.ctc,
      });
    }
  }
  return [...byEmployee.values()];
}

/** The single definition of "what a report row looks like" per type, shared by both the CSV
 * and XLSX export branches so they can never drift apart from each other or from the JSON shape. */
function flattenReportRows(type: ReportType, data: Record<string, unknown>): Record<string, unknown>[] {
  if (type === "summary") {
    return Object.entries(data)
      .filter(([, v]) => typeof v !== "object" || v === null)
      .map(([metric, value]) => ({ metric, value }));
  }
  if (type === "pt" || type === "lwf") {
    const states = data.states as Array<{ state: string; employees: Record<string, unknown>[] }>;
    return states.flatMap((s) => s.employees.map((e) => ({ state: s.state, ...e })));
  }
  if (type === "headcount") {
    const d = data as {
      byDepartment: { department: string; count: number }[];
      byState: { state: string; count: number }[];
      byEmploymentType: { employmentType: string; count: number }[];
    };
    return [
      ...d.byDepartment.map((x) => ({ dimension: "department", key: x.department, count: x.count })),
      ...d.byState.map((x) => ({ dimension: "state", key: x.state, count: x.count })),
      ...d.byEmploymentType.map((x) => ({ dimension: "employmentType", key: x.employmentType, count: x.count })),
    ];
  }
  return (data.employees as Record<string, unknown>[]) ?? [];
}

async function buildXlsxResponse(rows: Record<string, unknown>[], sheetName: string, filenameBase: string): Promise<NextResponse> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  if (rows.length > 0) {
    const headers = Object.keys(rows[0]);
    sheet.addRow(headers);
    for (const row of rows) {
      sheet.addRow(headers.map((h) => row[h] as ExcelJS.CellValue));
    }
    // PAN numbers are alphanumeric codes prone to Excel auto-formatting corruption — same
    // text-forcing treatment bank-file/route.ts already uses for account numbers/IFSC.
    const panColIndex = headers.indexOf("panNumber");
    if (panColIndex !== -1) {
      sheet.getColumn(panColIndex + 1).numFmt = "@";
    }
    sheet.columns.forEach((col) => { col.width = 18; });
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filenameBase}.xlsx"`,
    },
  });
}

function exportResponse(type: ReportType, format: ReportFormat, reportData: Record<string, unknown>, filenameBase: string): NextResponse | null {
  if (format === "csv") {
    const csv = Papa.unparse(flattenReportRows(type, reportData));
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filenameBase}.csv"`,
      },
    });
  }
  return null; // signals "not handled here" — xlsx is async, handled by the caller
}

// --- Headcount: always "right now," never a past date. There's no EmployeeStatusHistory-style
// table in this schema, so "as of a past date" can't be reconstructed for onboardingStatus
// transitions — rather than a misleading approximation, this report is current-state-only.
async function handleHeadcountReport(format: ReportFormat): Promise<NextResponse> {
  const [byDepartment, byState, byEmploymentType, totalActiveEmployees] = await Promise.all([
    db.employee.groupBy({ by: ["department"], where: ACTIVE_EMPLOYEE_WHERE, _count: { department: true }, orderBy: { _count: { department: "desc" } } }),
    db.employee.groupBy({ by: ["state"], where: ACTIVE_EMPLOYEE_WHERE, _count: { state: true }, orderBy: { _count: { state: "desc" } } }),
    db.employee.groupBy({ by: ["employmentType"], where: ACTIVE_EMPLOYEE_WHERE, _count: { employmentType: true }, orderBy: { _count: { employmentType: "desc" } } }),
    db.employee.count({ where: ACTIVE_EMPLOYEE_WHERE }),
  ]);

  const reportData = {
    asOf: new Date().toISOString(),
    totalActiveEmployees,
    byDepartment: byDepartment.map((d) => ({ department: d.department, count: d._count.department })),
    byState: byState.map((s) => ({ state: s.state, count: s._count.state })),
    byEmploymentType: byEmploymentType.map((e) => ({ employmentType: e.employmentType, count: e._count.employmentType })),
  };

  if (format === "xlsx") return buildXlsxResponse(flattenReportRows("headcount", reportData), "Headcount", "headcount-report");
  const csvRes = exportResponse("headcount", format, reportData, "headcount-report");
  if (csvRes) return csvRes;
  return NextResponse.json({ data: reportData });
}

// --- Attrition: who exited and when, within a date range. Best-effort join against
// ExitRequest for a reason — an employee can have dateOfExit set without ever going through
// the formal exit-request flow (e.g. a direct admin edit).
async function handleAttritionReport(fromDateStr: string, toDateStr: string, format: ReportFormat): Promise<NextResponse> {
  const fromDate = toDate(fromDateStr);
  const toDateRaw = toDate(toDateStr);
  if (!fromDate || !toDateRaw) {
    return apiError("fromDate/toDate must be valid dates (YYYY-MM-DD).", 400);
  }
  const toDateInclusive = new Date(toDateRaw.getTime() + 24 * 60 * 60 * 1000 - 1);

  const exitedEmployees = await db.employee.findMany({
    where: { dateOfExit: { gte: fromDate, lte: toDateInclusive } },
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      department: true,
      designation: true,
      state: true,
      employmentType: true,
      dateOfJoining: true,
      dateOfExit: true,
    },
    orderBy: { dateOfExit: "asc" },
  });

  const exitRequests = await db.exitRequest.findMany({
    where: { employeeId: { in: exitedEmployees.map((e) => e.id) } },
    select: { employeeId: true, reason: true },
  });
  const reasonByEmployee = new Map(exitRequests.map((r) => [r.employeeId, r.reason]));

  const employees = exitedEmployees.map((e) => {
    const tenureDays = Math.round((e.dateOfExit!.getTime() - e.dateOfJoining.getTime()) / (24 * 60 * 60 * 1000));
    return {
      employeeId: e.id,
      employeeCode: e.employeeCode,
      employeeName: `${e.firstName} ${e.lastName ?? ""}`.trim(),
      department: e.department,
      designation: e.designation,
      state: e.state,
      employmentType: e.employmentType,
      dateOfJoining: e.dateOfJoining.toISOString(),
      dateOfExit: e.dateOfExit!.toISOString(),
      tenureDays,
      tenureYears: Math.round((tenureDays / 365) * 10) / 10,
      exitReason: reasonByEmployee.get(e.id) ?? null,
    };
  });

  const byDepartmentMap = new Map<string, number>();
  for (const e of employees) byDepartmentMap.set(e.department, (byDepartmentMap.get(e.department) ?? 0) + 1);

  const reportData = {
    fromDate: fromDateStr,
    toDate: toDateStr,
    totalExits: employees.length,
    employees,
    byDepartment: [...byDepartmentMap.entries()].map(([department, count]) => ({ department, count })),
  };
  const filenameBase = `attrition-report-${fromDateStr}-to-${toDateStr}`;

  if (format === "xlsx") return buildXlsxResponse(employees, "Attrition", filenameBase);
  const csvRes = exportResponse("attrition", format, reportData, filenameBase);
  if (csvRes) return csvRes;
  return NextResponse.json({ data: reportData });
}

// GET /api/reports?month=1&year=2025&type=pf&format=csv
// GET /api/reports?fromMonth=1&fromYear=2025&toMonth=6&toYear=2025&type=pf  (multi-month range)
// GET /api/reports?type=headcount
// GET /api/reports?type=attrition&fromDate=2026-01-01&toDate=2026-06-30
export async function GET(request: NextRequest) {
  try {
    // Aggregate statutory/workforce reports — company-wide figures, not tied to one employee,
    // so manager gets the same access as admin/hr rather than self-scoping. Headcount/attrition
    // stay at this same tier: managers already see department/state/exit counts in aggregate on
    // their own Dashboard, so a row-level export of the same data isn't a narrowing.
    await requireRole(request, ["admin", "hr", "manager"]);
    const { searchParams } = new URL(request.url);
    const parsed = reportQuerySchema.parse(Object.fromEntries(searchParams));
    const { type, format } = parsed;

    if (type === "headcount") {
      return handleHeadcountReport(format);
    }
    if (type === "attrition") {
      if (!parsed.fromDate || !parsed.toDate) {
        return apiError("fromDate and toDate (YYYY-MM-DD) are required for the attrition report.", 400);
      }
      return handleAttritionReport(parsed.fromDate, parsed.toDate, format);
    }

    // Statutory types (pf/esi/tds/pt/lwf/summary): either a single month/year, or a full
    // from/to range, must be given.
    const isRange = parsed.fromMonth !== undefined;
    if (!isRange && (parsed.month === undefined || parsed.year === undefined)) {
      return apiError("month and year (or fromMonth/fromYear/toMonth/toYear for a range) are required for this report type.", 400);
    }

    let month: number;
    let year: number;
    let details: ReportDetailRow[];
    let company: { name: string; pan: string | null; tan: string | null; pfNumber: string | null; esiNumber: string | null } | null;
    let isRangeResult = false;
    let monthsIncluded: { month: number; year: number }[] = [];

    if (isRange) {
      let pairs: { month: number; year: number }[];
      try {
        pairs = enumerateMonthRange(parsed.fromMonth!, parsed.fromYear!, parsed.toMonth!, parsed.toYear!);
      } catch (err) {
        if (err instanceof InvalidRangeError) return apiError(err.message, 400);
        throw err;
      }

      const runs = await db.payrollRun.findMany({
        where: { runType: "regular", OR: pairs.map((p) => ({ month: p.month, year: p.year })) },
        include: {
          details: { include: { employee: { select: EMPLOYEE_SELECT } } },
          company: { select: { name: true, pan: true, tan: true, pfNumber: true, esiNumber: true } },
        },
      });

      if (runs.length === 0) {
        return apiError("No payroll runs found for the given range.", 404);
      }

      details = aggregateDetailsByEmployee(runs.flatMap((r) => r.details));
      company = runs[0].company;
      month = parsed.toMonth!;
      year = parsed.toYear!;
      isRangeResult = true;
      monthsIncluded = pairs;
    } else {
      month = parsed.month!;
      year = parsed.year!;

      const payrollRun = await db.payrollRun.findFirst({
        where: { month, year, runType: "regular" },
        include: {
          details: { include: { employee: { select: EMPLOYEE_SELECT } } },
          company: { select: { name: true, pan: true, tan: true, pfNumber: true, esiNumber: true } },
        },
      });

      if (!payrollRun) {
        return apiError("No payroll run found for the given month/year", 404);
      }

      details = payrollRun.details;
      company = payrollRun.company;
      monthsIncluded = [{ month, year }];
    }

    let reportData: Record<string, unknown>;

    switch (type as ReportType) {
      case "pf":
        reportData = {
          month,
          year,
          monthName: getMonthName(month),
          company,
          isRange: isRangeResult,
          monthsIncluded,
          totalEmployees: details.length,
          employees: details
            .filter((d) => d.employee.pfApplicable)
            .map((d) => {
              const basicDA = d.basic + d.dearnessAllowance;
              const epsWages = Math.min(basicDA, 15000);
              const employerEPS = Math.min(Math.round(epsWages * 0.0833), 1250);
              const employerEDLI = Math.round(Math.min(basicDA, 15000) * 0.005);
              return {
                employeeId: d.employee.id,
                employeeName: `${d.employee.firstName} ${d.employee.lastName ?? ""}`.trim(),
                employeeCode: d.employee.employeeCode,
                designation: d.employee.designation,
                department: d.employee.department,
                pfWages: basicDA,
                employeePF: d.employeePF,
                employerPF: d.employerPF,
                employerEPS,
                employerEDLI,
                totalPF: d.employeePF + d.employerPF + employerEPS + employerEDLI,
              };
            }),
          totals: {
            totalEmployeePF: details.reduce((s, d) => s + d.employeePF, 0),
            totalEmployerPF: details.reduce((s, d) => s + d.employerPF, 0),
            totalEmployerEPS: details
              .filter((d) => d.employee.pfApplicable)
              .reduce((s, d) => {
                const basicDA = d.basic + d.dearnessAllowance;
                return s + Math.min(Math.round(Math.min(basicDA, 15000) * 0.0833), 1250);
              }, 0),
            totalEmployerEDLI: details
              .filter((d) => d.employee.pfApplicable)
              .reduce((s, d) => {
                const basicDA = d.basic + d.dearnessAllowance;
                return s + Math.round(Math.min(basicDA, 15000) * 0.005);
              }, 0),
          },
        };
        break;

      case "esi": {
        const esiEmployees = details.filter((d) => d.employee.esiApplicable);
        reportData = {
          month,
          year,
          monthName: getMonthName(month),
          company,
          isRange: isRangeResult,
          monthsIncluded,
          totalApplicableEmployees: esiEmployees.length,
          employees: esiEmployees.map((d) => ({
            employeeId: d.employee.id,
            employeeName: `${d.employee.firstName} ${d.employee.lastName ?? ""}`.trim(),
            employeeCode: d.employee.employeeCode,
            designation: d.employee.designation,
            department: d.employee.department,
            esiWages: d.grossSalary,
            employeeESI: d.employeeESI,
            employerESI: d.employerESI,
            totalESI: d.employeeESI + d.employerESI,
          })),
          totals: {
            totalEmployeeESI: esiEmployees.reduce((s, d) => s + d.employeeESI, 0),
            totalEmployerESI: esiEmployees.reduce((s, d) => s + d.employerESI, 0),
          },
        };
        break;
      }

      case "tds":
        reportData = {
          month,
          year,
          monthName: getMonthName(month),
          company,
          isRange: isRangeResult,
          monthsIncluded,
          totalEmployees: details.length,
          employees: details.map((d) => ({
            employeeId: d.employee.id,
            employeeName: `${d.employee.firstName} ${d.employee.lastName ?? ""}`.trim(),
            employeeCode: d.employee.employeeCode,
            designation: d.employee.designation,
            department: d.employee.department,
            panNumber: d.employee.panNumber ?? "",
            taxRegime: d.employee.taxRegime,
            grossSalary: d.grossSalary,
            tdsMonthly: d.tds,
            tdsAnnual: Math.round(d.tds * 12),
          })),
          totals: {
            totalTDS: details.reduce((s, d) => s + d.tds, 0),
            totalTDSAnnual: details.reduce((s, d) => s + Math.round(d.tds * 12), 0),
            newRegimeCount: details.filter((d) => d.employee.taxRegime === "new").length,
            oldRegimeCount: details.filter((d) => d.employee.taxRegime === "old").length,
          },
        };
        break;

      case "pt": {
        const byState: Record<string, { employeeId: string; employeeName: string; employeeCode: string; department: string; grossSalary: number; professionalTax: number }[]> = {};
        for (const d of details) {
          const state = d.employee.state || "Unknown";
          if (!byState[state]) byState[state] = [];
          byState[state].push({
            employeeId: d.employee.id,
            employeeName: `${d.employee.firstName} ${d.employee.lastName ?? ""}`.trim(),
            employeeCode: d.employee.employeeCode,
            department: d.employee.department,
            grossSalary: d.grossSalary,
            professionalTax: d.professionalTax,
          });
        }
        const stateSummary = Object.entries(byState).map(([state, employees]) => ({
          state,
          employeeCount: employees.length,
          totalPT: employees.reduce((s, e) => s + e.professionalTax, 0),
          employees,
        }));
        reportData = {
          month,
          year,
          monthName: getMonthName(month),
          company,
          isRange: isRangeResult,
          monthsIncluded,
          totalPT: details.reduce((s, d) => s + d.professionalTax, 0),
          states: stateSummary,
        };
        break;
      }

      case "lwf": {
        const byState: Record<string, { employeeId: string; employeeName: string; employeeCode: string; department: string; lwf: number }[]> = {};
        for (const d of details) {
          if (d.lwf <= 0) continue;
          const state = d.employee.state || "Unknown";
          if (!byState[state]) byState[state] = [];
          byState[state].push({
            employeeId: d.employee.id,
            employeeName: `${d.employee.firstName} ${d.employee.lastName ?? ""}`.trim(),
            employeeCode: d.employee.employeeCode,
            department: d.employee.department,
            lwf: d.lwf,
          });
        }
        const stateSummary = Object.entries(byState).map(([state, employees]) => ({
          state,
          employeeCount: employees.length,
          totalLWF: employees.reduce((s, e) => s + e.lwf, 0),
          employees,
        }));
        reportData = {
          month,
          year,
          monthName: getMonthName(month),
          company,
          isRange: isRangeResult,
          monthsIncluded,
          totalLWF: details.reduce((s, d) => s + d.lwf, 0),
          states: stateSummary,
        };
        break;
      }

      case "summary":
      default: {
        const totalGross = details.reduce((s, d) => s + d.grossSalary, 0);
        const totalNet = details.reduce((s, d) => s + d.netSalary, 0);
        const totalDeductions = details.reduce((s, d) => s + d.totalDeductions, 0);
        const totalEarnings = details.reduce((s, d) => s + d.totalEarnings, 0);
        const totalCTC = details.reduce((s, d) => s + d.ctc, 0);
        const totalEmployeePF = details.reduce((s, d) => s + d.employeePF, 0);
        const totalEmployerPF = details.reduce((s, d) => s + d.employerPF, 0);
        const totalEmployeeESI = details.reduce((s, d) => s + d.employeeESI, 0);
        const totalEmployerESI = details.reduce((s, d) => s + d.employerESI, 0);
        const totalTDS = details.reduce((s, d) => s + d.tds, 0);
        const totalPT = details.reduce((s, d) => s + d.professionalTax, 0);
        const totalLWF = details.reduce((s, d) => s + d.lwf, 0);

        reportData = {
          month,
          year,
          monthName: getMonthName(month),
          company,
          isRange: isRangeResult,
          monthsIncluded,
          totalEmployees: details.length,
          earnings: { totalEarnings, totalGrossSalary: totalGross, totalCTC },
          deductions: { totalDeductions, totalEmployeePF, totalTDS, totalPT, totalLWF, totalEmployeeESI },
          employerContributions: { totalEmployerPF, totalEmployerESI },
          netPay: { totalNetSalary: totalNet, totalGrossSalary: totalGross, totalDeductions },
          statutoryTotals: {
            pf: { employeeShare: totalEmployeePF, employerShare: totalEmployerPF, total: totalEmployeePF + totalEmployerPF },
            esi: { employeeShare: totalEmployeeESI, employerShare: totalEmployerESI, total: totalEmployeeESI + totalEmployerESI },
            tds: totalTDS,
            professionalTax: totalPT,
            lwf: totalLWF,
          },
        };
      }
    }

    const filenameBase = `${type}-report-${month}-${year}`;
    if (format === "xlsx") return await buildXlsxResponse(flattenReportRows(type as ReportType, reportData), type, filenameBase);
    const csvRes = exportResponse(type as ReportType, format, reportData, filenameBase);
    if (csvRes) return csvRes;

    return NextResponse.json({ data: reportData });
  } catch (error) {
    return handleApiError(error, "generate report");
  }
}
