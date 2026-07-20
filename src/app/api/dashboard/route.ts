import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    // --- Date helpers for today ---
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfNextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    // Run all independent queries in parallel
    const [
      totalEmployees,
      presentToday,
      onLeaveToday,
      latestPayrollRun,
      recentPayrollRuns,
      departmentCounts,
      stateCounts,
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

      // 4. Latest payroll run (for monthly summary)
      db.payrollRun.findFirst({
        orderBy: [{ year: "desc" }, { month: "desc" }],
      }),

      // 5. Recent payroll runs (last 6)
      db.payrollRun.findMany({
        orderBy: [{ year: "desc" }, { month: "desc" }],
        take: 6,
      }),

      // 6. Department-wise employee count
      db.employee.groupBy({
        by: ["department"],
        where: { dateOfExit: null },
        _count: { department: true },
        orderBy: { _count: { department: "desc" } },
      }),

      // 7. State-wise employee count
      db.employee.groupBy({
        by: ["state"],
        where: { dateOfExit: null },
        _count: { state: true },
        orderBy: { _count: { state: "desc" } },
      }),
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
    console.error("Dashboard API error:", error);
    return NextResponse.json(
      { error: "Failed to load dashboard data" },
      { status: 500 }
    );
  }
}