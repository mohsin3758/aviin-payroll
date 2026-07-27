import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError, handleApiError, getDefaultCompanyId } from "@/lib/api-utils";
import { getDaysInMonth, processAlternateEmployeePayroll, CONTRACTOR_TDS_RATE, type AlternateWageType } from "@/lib/payroll/engine";
import { logAudit } from "@/lib/audit";
import { notifyEmployee } from "@/lib/notifications";

const entrySchema = z.object({
  employeeId: z.string().min(1),
  unitsWorked: z.coerce.number().positive(), // days / hours / invoice units, depending on the employee's employmentType
  rateOverride: z.coerce.number().positive().optional(), // falls back to the employee's dailyRate/hourlyRate
});

const alternatePaySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
  entries: z.array(entrySchema).min(1),
});

// POST /api/payroll/alternate-pay — admin/hr only. Processes pay for contractor/daily-wage/
// hourly employees, who don't fit the attendance-prorated monthly slab engine the regular run
// uses. Each employee's own Employee.employmentType decides which calculation applies; contractor
// entries require rateOverride (their invoiced amount) since they have no standing daily/hourly
// rate on file.
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const body = await request.json();
    const { month, year, entries } = alternatePaySchema.parse(body);

    const companyId = await getDefaultCompanyId();
    const daysInMonth = getDaysInMonth(month, year);

    const employees = await db.employee.findMany({
      where: { id: { in: entries.map((e) => e.employeeId) } },
      include: { salaryStructure: true },
    });
    const employeeMap = new Map(employees.map((e) => [e.id, e]));

    const details: {
      employeeId: string; daysInMonth: number; presentDays: number; paidDays: number;
      basic: number; dearnessAllowance: number; houseRentAllowance: number; conveyanceAllowance: number;
      medicalAllowance: number; specialAllowance: number; overtimeAllowance: number; bonus: number;
      otherEarnings: number; totalEarnings: number; employeePF: number; employerPF: number;
      employeeESI: number; employerESI: number; tds: number; professionalTax: number; lwf: number;
      totalDeductions: number; netSalary: number; grossSalary: number; ctc: number;
    }[] = [];
    const notifications: { employeeId: string; netPay: number }[] = [];

    for (const entry of entries) {
      const employee = employeeMap.get(entry.employeeId);
      if (!employee) {
        return apiError(`Employee not found: ${entry.employeeId}`, 404);
      }
      if (employee.employmentType === "permanent") {
        return apiError(`${employee.firstName} ${employee.lastName ?? ""} is a permanent employee — process them through the regular monthly payroll run instead.`, 400);
      }

      const wageType = employee.employmentType as AlternateWageType;
      const rate = entry.rateOverride ?? (wageType === "daily_wage" ? employee.salaryStructure?.dailyRate : wageType === "hourly" ? employee.salaryStructure?.hourlyRate : undefined);
      if (!rate) {
        return apiError(`No rate configured for ${employee.firstName} ${employee.lastName ?? ""} — set it on their salary structure or pass rateOverride.`, 400);
      }

      const result = processAlternateEmployeePayroll(employee, wageType, rate, entry.unitsWorked, CONTRACTOR_TDS_RATE);

      details.push({
        employeeId: employee.id,
        daysInMonth,
        presentDays: entry.unitsWorked,
        paidDays: entry.unitsWorked,
        basic: 0, dearnessAllowance: 0, houseRentAllowance: 0, conveyanceAllowance: 0,
        medicalAllowance: 0, specialAllowance: 0, overtimeAllowance: 0, bonus: 0,
        otherEarnings: result.grossPay,
        totalEarnings: result.grossPay,
        employeePF: 0, employerPF: 0, employeeESI: 0, employerESI: 0,
        tds: result.tds,
        professionalTax: 0, lwf: 0,
        totalDeductions: result.tds,
        netSalary: result.netPay,
        grossSalary: result.grossPay,
        ctc: result.grossPay,
      });
      notifications.push({ employeeId: employee.id, netPay: result.netPay });
    }

    const totals = details.reduce(
      (acc, d) => ({
        totalGrossSalary: acc.totalGrossSalary + d.grossSalary,
        totalDeductions: acc.totalDeductions + d.totalDeductions,
        totalNetSalary: acc.totalNetSalary + d.netSalary,
        totalTDS: acc.totalTDS + d.tds,
      }),
      { totalGrossSalary: 0, totalDeductions: 0, totalNetSalary: 0, totalTDS: 0 }
    );

    // One PayrollRun per (company, month, year, runType) — a second call for the same month
    // (e.g. someone forgotten in the first batch) appends new details to the existing run
    // rather than colliding with the unique constraint or silently double-paying anyone.
    const existingRun = await db.payrollRun.findUnique({
      where: { companyId_month_year_runType: { companyId, month, year, runType: "alternate_pay" } },
      include: { details: true },
    });
    if (existingRun) {
      const alreadyProcessed = details.filter((d) => existingRun.details.some((ed) => ed.employeeId === d.employeeId));
      if (alreadyProcessed.length > 0) {
        return apiError(`Already processed this month for: ${alreadyProcessed.map((d) => employeeMap.get(d.employeeId)?.employeeCode).join(", ")}`, 409);
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
            runType: "alternate_pay",
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

    await logAudit({ session, action: "process", entity: "PayrollRun", entityId: run.id, details: { runType: "alternate_pay", employees: details.length } });

    await Promise.all(
      notifications.map((n) =>
        notifyEmployee(n.employeeId, {
          title: "Payment processed",
          message: `Your payment of ₹${n.netPay.toLocaleString("en-IN")} has been processed.`,
          category: "payroll",
        })
      )
    );

    return NextResponse.json({ data: run }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "process alternate pay");
  }
}
