import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    // Company-wide financial aggregates (salaryStats, payrollSummary, recentPayrollRuns) and
    // exit/headcount analytics are admin/hr/manager only — same tier as Reports (aggregate
    // figures, not one named person's data). Employee gets the generic company-pulse counts
    // only. The Dashboard nav item itself stays visible to every role; this scopes the data.
    const isElevated = session.role === "admin" || session.role === "hr" || session.role === "manager";

    // --- Date helpers for today ---
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfNextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    const startOfQuarter = new Date(now.getFullYear(), quarterStartMonth, 1);

    // Run all independent queries in parallel. Financial/analytics queries are skipped
    // entirely (not just redacted after the fact) for a non-elevated caller — no reason to
    // even compute them.
    const [
      totalEmployees,
      presentToday,
      onLeaveToday,
      latestPayrollRun,
      recentPayrollRuns,
      departmentCounts,
      stateCounts,
      pendingExitApprovals,
      employeesInNotice,
      exitsThisMonth,
      exitsThisQuarter,
    ] = await Promise.all([
      // 1. Total active employees
      db.employee.count({
        where: { dateOfExit: null },
      }),

      // 2. Present today
      db.attendance.count({
        where: {
          date: { gte: startOfDay, lt: startOfNextDay },
          status: "present",
        },
      }),

      // 3. On leave today (approved leave spanning today)
      db.leaveApplication.count({
        where: {
          status: "approved",
          startDate: { lte: endOfDay },
          endDate: { gte: startOfDay },
        },
      }),

      // 4. Latest REGULAR payroll run (for monthly summary) — off-cycle/alternate-pay runs
      // are a separate concept and must not be mistaken for the monthly summary here.
      !isElevated ? Promise.resolve(null) : db.payrollRun.findFirst({
        where: { runType: "regular" },
        orderBy: [{ year: "desc" }, { month: "desc" }],
      }),

      // 5. Recent regular payroll runs (last 6)
      !isElevated ? Promise.resolve([]) : db.payrollRun.findMany({
        where: { runType: "regular" },
        orderBy: [{ year: "desc" }, { month: "desc" }],
        take: 6,
      }),

      // 6. Department-wise employee count
      !isElevated ? Promise.resolve([]) : db.employee.groupBy({
        by: ["department"],
        where: { dateOfExit: null },
        _count: { department: true },
        orderBy: { _count: { department: "desc" } },
      }),

      // 7. State-wise employee count
      !isElevated ? Promise.resolve([]) : db.employee.groupBy({
        by: ["state"],
        where: { dateOfExit: null },
        _count: { state: true },
        orderBy: { _count: { state: "desc" } },
      }),

      // 8. Exit requests still awaiting either approval stage
      !isElevated ? Promise.resolve(0) : db.exitRequest.count({ where: { status: { in: ["pending_manager", "pending_hr"] } } }),

      // 9. Approved resignations whose last working day hasn't arrived yet (serving notice) —
      // excludes anyone already fully settled, since finalizing doesn't change ExitRequest.status.
      !isElevated ? Promise.resolve(0) : db.exitRequest.count({
        where: {
          status: "approved",
          lastWorkingDate: { gte: startOfDay },
          OR: [{ finalSettlement: null }, { finalSettlement: { is: { status: { notIn: ["finalized", "paid"] } } } }],
        },
      }),

      // 10. Attrition — actually exited this calendar month
      !isElevated ? Promise.resolve(0) : db.employee.count({ where: { dateOfExit: { gte: startOfMonth, lt: startOfNextMonth } } }),

      // 11. Attrition — actually exited this quarter
      !isElevated ? Promise.resolve(0) : db.employee.count({ where: { dateOfExit: { gte: startOfQuarter, lt: startOfNextMonth } } }),
    ]);

    // Build monthly payroll summary from latest run
    const payrollSummary = latestPayrollRun
      ? {
          month: latestPayrollRun.month,
          year: latestPayrollRun.year,
          status: latestPayrollRun.status,
          totalEmployees: latestPayrollRun.totalEmployees,
          processedAt: latestPayrollRun.processedAt,
        }
      : null;

    // Build monthly salary stats from latest run
    const salaryStats = latestPayrollRun
      ? {
          totalGross: latestPayrollRun.totalGrossSalary,
          totalDeductions: latestPayrollRun.totalDeductions,
          totalNet: latestPayrollRun.totalNetSalary,
          totalTDS: latestPayrollRun.totalTDS,
          totalPF: latestPayrollRun.totalEmployeePF,
          totalESI: latestPayrollRun.totalEmployeeESI,
          totalEmployerPF: latestPayrollRun.totalEmployerPF,
          totalEmployerESI: latestPayrollRun.totalEmployerESI,
          totalPT: latestPayrollRun.totalPT,
          totalLWF: latestPayrollRun.totalLWF,
        }
      : null;

    return NextResponse.json({
      totalEmployees,
      presentToday,
      onLeaveToday,
      payrollSummary,
      salaryStats,
      departmentCounts: departmentCounts.map((d) => ({
        department: d.department,
        count: d._count.department,
      })),
      stateCounts: stateCounts.map((s) => ({
        state: s.state,
        count: s._count.state,
      })),
      exitAnalytics: {
        pendingExitApprovals,
        employeesInNotice,
        exitsThisMonth,
        exitsThisQuarter,
      },
      recentPayrollRuns: recentPayrollRuns.map((r) => ({
        id: r.id,
        month: r.month,
        year: r.year,
        status: r.status,
        totalEmployees: r.totalEmployees,
        totalGrossSalary: r.totalGrossSalary,
        totalNetSalary: r.totalNetSalary,
        processedAt: r.processedAt,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    return handleApiError(error, "load dashboard data");
  }
}