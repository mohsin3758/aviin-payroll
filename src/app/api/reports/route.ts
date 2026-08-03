import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getMonthName, getDaysInMonth } from "@/lib/payroll/engine";
import { enumerateMonthRange, InvalidRangeError } from "@/lib/payroll/report-range";
import { computeMonthlyAttendance } from "@/lib/payroll/attendance-tally";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { requireRole } from "@/lib/auth";
import { apiError, handleApiError, toDate, getDefaultCompanyId } from "@/lib/api-utils";
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

// A plain data table (title, subtitle, header row, data rows, totals-free — totals are already
// visible in the JSON/CSV/XLSX exports) via pdfkit, a lightweight pure-Node PDF-drawing library
// — no headless browser needed for a document this simple. Every report type funnels through
// the same `flattenReportRows`-shaped rows the CSV/XLSX branches already use, so there's one
// definition of "what a report row looks like," not a fourth parallel one.
async function buildPdfResponse(rows: Record<string, unknown>[], title: string, subtitle: string, filenameBase: string): Promise<NextResponse> {
  const doc = new PDFDocument({ margin: 40, size: "A4" });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  doc.fontSize(16).font("Helvetica-Bold").text(title);
  doc.fontSize(10).font("Helvetica").fillColor("#666666").text(subtitle);
  doc.fillColor("#000000").moveDown(1);

  if (rows.length === 0) {
    doc.fontSize(10).text("No data available for this period.");
  } else {
    const headers = Object.keys(rows[0]);
    const left = doc.page.margins.left;
    const pageWidth = doc.page.width - left - doc.page.margins.right;
    const colWidth = pageWidth / headers.length;
    const rowHeight = 16;
    const bottomLimit = doc.page.height - doc.page.margins.bottom;

    const drawHeaderRow = (y: number) => {
      doc.fontSize(7.5).font("Helvetica-Bold");
      headers.forEach((h, i) => doc.text(h, left + i * colWidth, y, { width: colWidth - 4, ellipsis: true }));
      doc.moveTo(left, y + rowHeight - 4).lineTo(left + pageWidth, y + rowHeight - 4).strokeColor("#cccccc").stroke();
      doc.font("Helvetica").fillColor("#000000");
    };

    let y = doc.y;
    drawHeaderRow(y);
    y += rowHeight;

    for (const row of rows) {
      if (y + rowHeight > bottomLimit) {
        doc.addPage();
        y = doc.page.margins.top;
        drawHeaderRow(y);
        y += rowHeight;
      }
      doc.fontSize(7.5);
      headers.forEach((h, i) => {
        const value = row[h];
        const text = value === null || value === undefined ? "" : String(value);
        doc.text(text, left + i * colWidth, y, { width: colWidth - 4, ellipsis: true });
      });
      y += rowHeight;
    }
  }

  doc.end();
  const buffer = await finished;

  return new NextResponse(Buffer.from(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filenameBase}.pdf"`,
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

  const headcountRows = flattenReportRows("headcount", reportData);
  if (format === "xlsx") return buildXlsxResponse(headcountRows, "Headcount", "headcount-report");
  if (format === "pdf") return buildPdfResponse(headcountRows, "Headcount Report", `As of ${new Date(reportData.asOf).toLocaleDateString("en-IN")}`, "headcount-report");
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
  if (format === "pdf") return buildPdfResponse(employees, "Attrition Report", `${fromDateStr} to ${toDateStr}`, filenameBase);
  const csvRes = exportResponse("attrition", format, reportData, filenameBase);
  if (csvRes) return csvRes;
  return NextResponse.json({ data: reportData });
}

// --- Attendance: per-employee monthly present/absent/half-day summary. Reuses the EXACT same
// day-by-day tally payroll itself pays against (src/lib/payroll/attendance-tally.ts) so this
// report can never disagree with what employees are actually paid for.
async function handleAttendanceReport(month: number, year: number, format: ReportFormat): Promise<NextResponse> {
  const companyId = await getDefaultCompanyId();
  const company = await db.company.findUnique({ where: { id: companyId } });
  if (!company) return apiError("Company not found", 404);

  const daysInMonth = getDaysInMonth(month, year);
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 1));
  const holidays = await db.holiday.findMany({ where: { companyId: company.id, date: { gte: monthStart, lt: monthEnd } } });
  const holidayDateKeys = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));
  const weeklyOffDays = company.weeklyOffDays
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n >= 0 && n <= 6);

  const employees = await db.employee.findMany({
    where: { companyId: company.id, ...ACTIVE_EMPLOYEE_WHERE },
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      department: true,
      designation: true,
      attendance: { where: { date: { gte: monthStart, lt: monthEnd } } },
    },
  });

  const rows = employees.map((emp) => {
    const { presentDays, absentDays, halfDays, overtimeHours } = computeMonthlyAttendance(
      emp.attendance,
      daysInMonth,
      month,
      year,
      holidayDateKeys,
      weeklyOffDays
    );
    return {
      employeeId: emp.id,
      employeeCode: emp.employeeCode,
      employeeName: `${emp.firstName} ${emp.lastName ?? ""}`.trim(),
      department: emp.department,
      designation: emp.designation,
      daysInMonth,
      presentDays,
      absentDays,
      halfDays,
      attendancePercent: daysInMonth > 0 ? Math.round((presentDays / daysInMonth) * 1000) / 10 : 0,
      overtimeHours: Math.round(overtimeHours * 10) / 10,
    };
  });

  const totals = {
    totalEmployees: rows.length,
    avgAttendancePercent: rows.length > 0 ? Math.round((rows.reduce((s, r) => s + r.attendancePercent, 0) / rows.length) * 10) / 10 : 0,
  };

  const reportData = { month, year, monthName: getMonthName(month), daysInMonth, employees: rows, totals };
  const filenameBase = `attendance-report-${month}-${year}`;

  if (format === "xlsx") return buildXlsxResponse(rows, "Attendance", filenameBase);
  if (format === "pdf") return buildPdfResponse(rows, "Attendance Report", `${getMonthName(month)} ${year}`, filenameBase);
  const csvRes = exportResponse("attendance", format, reportData, filenameBase);
  if (csvRes) return csvRes;
  return NextResponse.json({ data: reportData });
}

// --- Leave Balance: company-wide snapshot of the materialized LeaveBalance table for a given
// year (defaults to current year) — mirrors GET /api/leaves/balance's own query shape (that
// route is scoped to one employee; this is the same table across everyone), computing
// `remaining` the same way the client there already does.
async function handleLeaveBalanceReport(year: number | undefined, format: ReportFormat): Promise<NextResponse> {
  const targetYear = year ?? new Date().getFullYear();

  const balances = await db.leaveBalance.findMany({
    where: { year: targetYear },
    include: {
      leaveType: { select: { name: true } },
      employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true, department: true } },
    },
    orderBy: [{ employee: { employeeCode: "asc" } }, { leaveType: { name: "asc" } }],
  });

  const rows = balances.map((b) => ({
    employeeId: b.employee.id,
    employeeCode: b.employee.employeeCode,
    employeeName: `${b.employee.firstName} ${b.employee.lastName ?? ""}`.trim(),
    department: b.employee.department,
    leaveType: b.leaveType.name,
    totalAllocated: b.totalAllocated,
    carryForwarded: b.carryForwarded,
    used: b.used,
    remaining: b.totalAllocated + b.carryForwarded - b.used,
  }));

  const byLeaveTypeMap = new Map<string, { totalAllocated: number; used: number; remaining: number }>();
  for (const r of rows) {
    const existing = byLeaveTypeMap.get(r.leaveType) ?? { totalAllocated: 0, used: 0, remaining: 0 };
    existing.totalAllocated += r.totalAllocated;
    existing.used += r.used;
    existing.remaining += r.remaining;
    byLeaveTypeMap.set(r.leaveType, existing);
  }
  const byLeaveType = [...byLeaveTypeMap.entries()].map(([leaveType, totals]) => ({ leaveType, ...totals }));

  const reportData = { year: targetYear, employees: rows, byLeaveType };
  const filenameBase = `leave-balance-report-${targetYear}`;

  if (format === "xlsx") return buildXlsxResponse(rows, "Leave Balance", filenameBase);
  if (format === "pdf") return buildPdfResponse(rows, "Leave Balance Report", `Year ${targetYear}`, filenameBase);
  const csvRes = exportResponse("leave-balance", format, reportData, filenameBase);
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
    if (type === "attendance") {
      if (parsed.month === undefined || parsed.year === undefined) {
        return apiError("month and year are required for the attendance report.", 400);
      }
      return handleAttendanceReport(parsed.month, parsed.year, format);
    }
    if (type === "leave-balance") {
      return handleLeaveBalanceReport(parsed.year, format);
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
    const periodLabel = isRangeResult
      ? `${getMonthName(monthsIncluded[0].month)} ${monthsIncluded[0].year} – ${getMonthName(month)} ${year}`
      : `${getMonthName(month)} ${year}`;
    if (format === "xlsx") return await buildXlsxResponse(flattenReportRows(type as ReportType, reportData), type, filenameBase);
    if (format === "pdf") return await buildPdfResponse(flattenReportRows(type as ReportType, reportData), `${type.toUpperCase()} Report`, periodLabel, filenameBase);
    const csvRes = exportResponse(type as ReportType, format, reportData, filenameBase);
    if (csvRes) return csvRes;

    return NextResponse.json({ data: reportData });
  } catch (error) {
    return handleApiError(error, "generate report");
  }
}
