import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePayrollFeature, inEmployeeScope } from "@/lib/payroll-access";
import { apiError, handleApiError, getDefaultCompanyId } from "@/lib/api-utils";
import { getDaysInMonth } from "@/lib/payroll/engine";
import { logAudit } from "@/lib/audit";
import { notifyEmployee } from "@/lib/notifications";

const offCycleSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
  reason: z.string().trim().min(1).max(200),
  tdsRate: z.coerce.number().min(0).max(0.42).default(0.1),
  entries: z.array(z.object({
    employeeId: z.string().min(1),
    amount: z.coerce.number().positive(),
  })).min(1),
});

// POST /api/payroll/off-cycle — admin/hr only. A separate bonus/incentive-only run alongside
// (not instead of) the regular monthly run for the same month — e.g. a Diwali bonus payout.
// No PF/ESI/PT is deducted (bonus payments are typically outside those wage definitions); TDS
// is deducted at a flat configurable rate rather than a full annual slab recompute, since an
// off-cycle payout doesn't carry the monthly context that calculation needs.
export async function POST(request: NextRequest) {
  try {
    const { session, restriction } = await requirePayrollFeature(request, ["admin", "hr"], "process_payroll");
    const body = await request.json();
    const { month, year, reason, tdsRate, entries } = offCycleSchema.parse(body);

    const outOfScope = entries.filter((e) => !inEmployeeScope(restriction, e.employeeId)).map((e) => e.employeeId);
    if (outOfScope.length > 0) {
      return apiError(`You don't have payroll access to: ${outOfScope.join(", ")}`, 403);
    }

    const companyId = await getDefaultCompanyId();
    const daysInMonth = getDaysInMonth(month, year);

    const employees = await db.employee.findMany({
      where: { id: { in: entries.map((e) => e.employeeId) } },
    });
    const employeeMap = new Map(employees.map((e) => [e.id, e]));
    const missing = entries.filter((e) => !employeeMap.has(e.employeeId));
    if (missing.length > 0) {
      return apiError(`Employee(s) not found: ${missing.map((m) => m.employeeId).join(", ")}`, 404);
    }

    const details = entries.map((entry) => {
      const tds = Math.round(entry.amount * tdsRate);
      const netSalary = entry.amount - tds;
      return {
        employeeId: entry.employeeId,
        daysInMonth,
        presentDays: daysInMonth,
        paidDays: daysInMonth,
        basic: 0, dearnessAllowance: 0, houseRentAllowance: 0, conveyanceAllowance: 0,
        medicalAllowance: 0, specialAllowance: 0, overtimeAllowance: 0,
        bonus: entry.amount,
        otherEarnings: 0,
        totalEarnings: entry.amount,
        employeePF: 0, employerPF: 0, employeeESI: 0, employerESI: 0,
        tds,
        professionalTax: 0, lwf: 0,
        totalDeductions: tds,
        netSalary,
        grossSalary: entry.amount,
        ctc: entry.amount,
      };
    });

    const totals = details.reduce(
      (acc, d) => ({
        totalGrossSalary: acc.totalGrossSalary + d.grossSalary,
        totalDeductions: acc.totalDeductions + d.totalDeductions,
        totalNetSalary: acc.totalNetSalary + d.netSalary,
        totalTDS: acc.totalTDS + d.tds,
      }),
      { totalGrossSalary: 0, totalDeductions: 0, totalNetSalary: 0, totalTDS: 0 }
    );

    // One PayrollRun per (company, month, year, runType) — a second off-cycle batch in the
    // same month (e.g. a separate spot bonus later) appends to the existing run instead of
    // colliding with the unique constraint or silently double-paying anyone.
    const existingRun = await db.payrollRun.findUnique({
      where: { companyId_month_year_runType: { companyId, month, year, runType: "off_cycle" } },
      include: { details: true },
    });
    if (existingRun) {
      const alreadyProcessed = details.filter((d) => existingRun.details.some((ed) => ed.employeeId === d.employeeId));
      if (alreadyProcessed.length > 0) {
        return apiError(`Already processed this off-cycle run this month for employee(s): ${alreadyProcessed.map((d) => d.employeeId).join(", ")}`, 409);
      }
    }

    const run = existingRun
      ? await db.payrollRun.update({
          where: { id: existingRun.id },
          data: {
            totalEmployees: existingRun.totalEmployees + details.length,
            totalGrossSalary: existingRun.totalGrossSalary + totals.totalGrossSalary,
            totalDeductions: existingRun.totalDeductions + totals.totalDeductions,
            totalNetSalary: existingRun.totalNetSalary + totals.totalNetSalary,
            totalTDS: existingRun.totalTDS + totals.totalTDS,
            details: { create: details },
          },
          include: { details: true },
        })
      : await db.payrollRun.create({
          data: {
            companyId,
            month,
            year,
            runType: "off_cycle",
            status: "processed",
            totalEmployees: details.length,
            totalGrossSalary: totals.totalGrossSalary,
            totalDeductions: totals.totalDeductions,
            totalNetSalary: totals.totalNetSalary,
            totalTDS: totals.totalTDS,
            processedAt: new Date(),
            details: { create: details },
          },
          include: { details: true },
        });

    await logAudit({ session, action: "process", entity: "PayrollRun", entityId: run.id, details: { runType: "off_cycle", reason, employees: details.length } });

    await Promise.all(
      entries.map((entry) =>
        notifyEmployee(entry.employeeId, {
          title: "Off-cycle payment processed",
          message: `${reason}: ₹${entry.amount.toLocaleString("en-IN")} processed for you.`,
          category: "payroll",
        })
      )
    );

    return NextResponse.json({ data: run }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "process off-cycle payroll");
  }
}
