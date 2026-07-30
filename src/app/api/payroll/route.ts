import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  processEmployeePayroll,
  getDaysInMonth,
  STANDARD_HOURS_PER_DAY,
  type EmployeePayrollInput,
} from "@/lib/payroll/engine";
import { apiError, getDefaultCompanyId, handleApiError } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { refreshPendingHiringIncentiveVesting } from "@/lib/payroll/hiring-incentive";

// GET /api/payroll - List payroll runs with optional filters
export async function GET(request: NextRequest) {
  try {
    // Payroll run data (gross/net totals, per-run detail counts) — admin/hr only, not manager.
    await requireRole(request, ["admin", "hr"]);
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");
    const year = searchParams.get("year");
    const status = searchParams.get("status");
    // Defaults to the regular monthly cycle so this list — and the Payroll Processing view
    // built around it — isn't unexpectedly mixed with off-cycle/alternate-pay runs. Pass
    // ?runType=all to see everything, or a specific value to filter to just that type.
    const runType = searchParams.get("runType") ?? "regular";

    const where: Record<string, unknown> = {};
    if (month) where.month = parseInt(month, 10);
    if (year) where.year = parseInt(year, 10);
    if (status) where.status = status;
    if (runType !== "all") where.runType = runType;

    const payrollRuns = await db.payrollRun.findMany({
      where,
      orderBy: [{ year: "desc" }, { month: "desc" }],
      include: {
        _count: {
          select: { details: true },
        },
      },
    });

    return NextResponse.json(payrollRuns);
  } catch (error) {
    return handleApiError(error, "fetch payroll runs");
  }
}

// POST /api/payroll - Process payroll for a month
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const body = await request.json();
    const { month, year, force } = body;

    if (!month || !year || month < 1 || month > 12) {
      return apiError("Valid month (1-12) and year are required", 400);
    }

    // 1. Get the company (single-tenant — client-supplied companyId is never trusted)
    const resolvedCompanyId = await getDefaultCompanyId();
    const company = await db.company.findUnique({ where: { id: resolvedCompanyId } });

    if (!company) {
      return apiError("Company not found", 404);
    }

    // Guard: never allow silently overwriting a run that's already paid.
    // A "processed" (draft-reviewed) run can be recalculated once, explicitly, via force:true.
    const existingRun = await db.payrollRun.findUnique({
      where: { companyId_month_year_runType: { companyId: company.id, month, year, runType: "regular" } },
    });
    if (existingRun) {
      if (existingRun.status === "paid") {
        return apiError(
          `Payroll for ${month}/${year} is already marked "paid" and cannot be reprocessed. Reverse/adjust via a correction run instead.`,
          409
        );
      }
      if (existingRun.status === "processed" && !force) {
        return apiError(
          `Payroll for ${month}/${year} was already processed. Pass { "force": true } to explicitly recalculate it (this will replace all existing payroll details for this run).`,
          409
        );
      }
    }

    // Reprocessing must not double-charge loan EMIs or arrears already recorded against this
    // run — clear this run's own LoanPayment rows and reset arrears it paid back to "pending"
    // before recomputing (mirrors how PayrollDetail rows for this run are deleted+recreated below).
    if (existingRun) {
      await db.loanPayment.deleteMany({ where: { payrollRunId: existingRun.id } });
      await db.salaryArrear.updateMany({
        where: { paidInRunId: existingRun.id },
        data: { status: "pending", paidInRunId: null },
      });
      // Reset to "eligible" not "pending" — the vesting decision itself doesn't need
      // re-litigating on a reprocess, only which run it's attached to.
      await db.hiringIncentive.updateMany({
        where: { paidInRunId: existingRun.id },
        data: { status: "eligible", paidInRunId: null },
      });
    }

    // Re-evaluate every pending incentive's vesting/forfeiture against each candidate's current
    // dateOfExit before this run consumes any of them — there is no background job in this app,
    // so this synchronous refresh is what keeps "eligible" always current.
    await refreshPendingHiringIncentiveVesting();

    const daysInMonth = getDaysInMonth(month, year);

    // Company calendar: holidays and weekly-off days are paid automatically when an employee
    // has no explicit attendance record for that day (an explicit record, e.g. "absent",
    // still takes precedence over the auto-paid default).
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 1));
    const holidays = await db.holiday.findMany({
      where: { companyId: company.id, date: { gte: monthStart, lt: monthEnd } },
    });
    const holidayDateKeys = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));
    const weeklyOffDays = company.weeklyOffDays
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n >= 0 && n <= 6);

    // 2. Get all active employees (no dateOfExit) for that company
    const employees = await db.employee.findMany({
      where: {
        companyId: company.id,
        dateOfExit: null,
      },
      include: {
        salaryStructure: true,
        attendance: {
          where: {
            date: {
              gte: new Date(year, month - 1, 1),
              lt: new Date(year, month, 1),
            },
          },
        },
      },
    });

    if (employees.length === 0) {
      return apiError("No active employees found for this company", 404);
    }

    // 3 & 4. Process each employee and build aggregates
    const details: Array<{
      employeeId: string;
      daysInMonth: number;
      presentDays: number;
      paidDays: number;
      basic: number;
      dearnessAllowance: number;
      houseRentAllowance: number;
      conveyanceAllowance: number;
      medicalAllowance: number;
      specialAllowance: number;
      overtimeAllowance: number;
      bonus: number;
      otherEarnings: number;
      arrears: number;
      hiringIncentive: number;
      totalEarnings: number;
      employeePF: number;
      employerPF: number;
      employeeESI: number;
      employerESI: number;
      tds: number;
      professionalTax: number;
      lwf: number;
      otherDeductions: number;
      totalDeductions: number;
      netSalary: number;
      grossSalary: number;
      ctc: number;
    }> = [];
    const allLoanPayments: { loanId: string; amount: number }[] = [];
    const allArrearIdsPaid: string[] = [];
    const allHiringIncentiveIdsPaid: string[] = [];

    let totalEmployees = 0;
    let totalGrossSalary = 0;
    let totalDeductions = 0;
    let totalNetSalary = 0;
    let totalEmployerPF = 0;
    let totalEmployerESI = 0;
    let totalEmployeePF = 0;
    let totalEmployeeESI = 0;
    let totalTDS = 0;
    let totalPT = 0;
    let totalLWF = 0;
    const employeesWithCappedDeductions: string[] = [];

    for (const emp of employees) {
      // Skip employees without a salary structure
      if (!emp.salaryStructure) continue;

      // 3b. Calculate presentDays and overtime hours, day by day, so company holidays and
      // weekly-off days are auto-paid when the employee has no explicit attendance record.
      const attendanceByDate = new Map(
        emp.attendance.map((record) => [record.date.toISOString().slice(0, 10), record])
      );
      let presentDays = 0;
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
          }
          if (record.totalHours && record.totalHours > STANDARD_HOURS_PER_DAY) {
            overtimeHours += record.totalHours - STANDARD_HOURS_PER_DAY;
          }
        } else if (holidayDateKeys.has(dateKey) || weeklyOffDays.includes(dateObj.getUTCDay())) {
          presentDays += 1;
        }
      }

      // 3a. Build the EmployeePayrollInput
      const empInput: EmployeePayrollInput = {
        id: emp.id,
        firstName: emp.firstName,
        lastName: emp.lastName || "",
        employeeCode: emp.employeeCode,
        designation: emp.designation,
        department: emp.department,
        state: emp.state,
        panNumber: emp.panNumber,
        pfApplicable: emp.pfApplicable,
        esiApplicable: emp.esiApplicable,
        ptApplicable: emp.ptApplicable,
        lwfApplicable: emp.lwfApplicable,
        taxRegime: emp.taxRegime as "new" | "old",
        gender: emp.gender,
        dateOfJoining: emp.dateOfJoining,
        salaryStructure: {
          basic: emp.salaryStructure.basic,
          dearnessAllowance: emp.salaryStructure.dearnessAllowance,
          houseRentAllowance: emp.salaryStructure.houseRentAllowance,
          conveyanceAllowance: emp.salaryStructure.conveyanceAllowance,
          medicalAllowance: emp.salaryStructure.medicalAllowance,
          specialAllowance: emp.salaryStructure.specialAllowance,
          overtimeAllowance: emp.salaryStructure.overtimeAllowance,
          bonus: emp.salaryStructure.bonus,
          otherEarnings: emp.salaryStructure.otherEarnings,
          employerPF: emp.salaryStructure.employerPF,
          employerESI: emp.salaryStructure.employerESI,
          gratuity: emp.salaryStructure.gratuity,
        },
      };

      // Old-regime employees can declare real 80C/80D investments; the engine caps them
      // combined with PF+ESI (80C) and separately (80D) rather than trusting raw inputs.
      const declaration = await db.investmentDeclaration.findUnique({
        where: { employeeId_year: { employeeId: emp.id, year } },
      });

      // 3c. Call processEmployeePayroll
      const result = processEmployeePayroll(
        empInput,
        month,
        year,
        presentDays,
        daysInMonth,
        overtimeHours,
        { section80C: declaration?.section80C ?? 0, section80D: declaration?.section80D ?? 0 }
      );

      // Loan/advance EMI deductions: allocate against whatever earnings remain after
      // statutory deductions, never pushing net salary negative. "Remaining months" is
      // derived from actual LoanPayment history rather than a mutable counter, so
      // reprocessing (which clears this run's own payments above) can't double-charge.
      const activeLoans = await db.employeeLoan.findMany({
        where: { employeeId: emp.id, status: "active" },
        include: { _count: { select: { payments: true } } },
      });

      let availableForLoanDeduction = Math.max(0, result.totalEarnings - result.totalDeductions);
      let loanDeduction = 0;
      for (const loan of activeLoans) {
        const remainingMonths = loan.totalMonths - loan._count.payments;
        if (remainingMonths <= 0) continue;
        const amount = Math.min(loan.emiAmount, availableForLoanDeduction);
        if (amount <= 0) continue;
        loanDeduction += amount;
        availableForLoanDeduction -= amount;
        allLoanPayments.push({ loanId: loan.id, amount });
      }

      // Arrears / leave-encashment payouts scheduled for this exact month, not prorated.
      const pendingArrears = await db.salaryArrear.findMany({
        where: { employeeId: emp.id, payMonth: month, payYear: year, status: "pending" },
      });
      const arrearsAmount = pendingArrears.reduce((s, a) => s + a.amount, 0);
      for (const arrear of pendingArrears) {
        allArrearIdsPaid.push(arrear.id);
      }

      // Hiring incentives this employee has earned as a recruiter, vested and scheduled for
      // this exact month. Unlike arrears, this is folded into grossSalary/ctc too (below) —
      // it's a real compensation line item on the recruiter's slip, matching how the company's
      // own payroll spreadsheet reports it, not a retroactive correction to keep out of Gross.
      const eligibleIncentives = await db.hiringIncentive.findMany({
        where: { recruiterId: emp.id, payMonth: month, payYear: year, status: "eligible" },
      });
      const hiringIncentiveAmount = eligibleIncentives.reduce((s, i) => s + i.amount, 0);
      for (const incentive of eligibleIncentives) {
        allHiringIncentiveIdsPaid.push(incentive.id);
      }

      const adjustedTotalEarnings = result.totalEarnings + arrearsAmount + hiringIncentiveAmount;
      const adjustedTotalDeductions = result.totalDeductions + loanDeduction;
      const adjustedNetSalary = result.netSalary - loanDeduction + arrearsAmount + hiringIncentiveAmount;

      // Build detail record data
      const detailData = {
        employeeId: emp.id,
        daysInMonth: result.daysInMonth,
        presentDays: result.presentDays,
        paidDays: result.paidDays,
        basic: result.basic,
        dearnessAllowance: result.dearnessAllowance,
        houseRentAllowance: result.houseRentAllowance,
        conveyanceAllowance: result.conveyanceAllowance,
        medicalAllowance: result.medicalAllowance,
        specialAllowance: result.specialAllowance,
        overtimeAllowance: result.overtimeAllowance,
        bonus: result.bonus,
        otherEarnings: result.otherEarnings,
        arrears: arrearsAmount,
        hiringIncentive: hiringIncentiveAmount,
        totalEarnings: adjustedTotalEarnings,
        employeePF: result.employeePF,
        employerPF: result.employerPF,
        employeeESI: result.employeeESI,
        employerESI: result.employerESI,
        tds: result.tdsMonthly,
        professionalTax: result.ptAmount,
        lwf: result.lwfEmployee,
        otherDeductions: loanDeduction,
        totalDeductions: adjustedTotalDeductions,
        netSalary: adjustedNetSalary,
        // Unlike arrears, hiring incentives ARE folded into gross/CTC — see comment above.
        grossSalary: result.grossSalary + hiringIncentiveAmount,
        ctc: result.ctc + hiringIncentiveAmount,
      };

      details.push(detailData);

      if (result.deductionsCapped) {
        employeesWithCappedDeductions.push(emp.employeeCode);
      }

      // Accumulate totals (post-loan-deduction, post-arrears figures)
      totalEmployees += 1;
      totalGrossSalary += result.grossSalary + hiringIncentiveAmount;
      totalDeductions += adjustedTotalDeductions;
      totalNetSalary += adjustedNetSalary;
      totalEmployerPF += result.employerPF;
      totalEmployerESI += result.employerESI;
      totalEmployeePF += result.employeePF;
      totalEmployeeESI += result.employeeESI;
      totalTDS += result.tdsMonthly;
      totalPT += result.ptAmount;
      totalLWF += result.lwfEmployee;
    }

    if (totalEmployees === 0) {
      return apiError("No employees with salary structures found", 404);
    }

    // 4. Create/update PayrollRun with aggregated totals
    const payrollRun = await db.payrollRun.upsert({
      where: {
        companyId_month_year_runType: {
          companyId: company.id,
          month,
          year,
          runType: "regular",
        },
      },
      create: {
        companyId: company.id,
        month,
        year,
        status: "draft",
        totalEmployees,
        totalGrossSalary,
        totalDeductions,
        totalNetSalary,
        totalEmployerPF,
        totalEmployerESI,
        totalEmployeePF,
        totalEmployeeESI,
        totalTDS,
        totalPT,
        totalLWF,
        processedAt: new Date(),
        details: {
          create: details,
        },
      },
      update: {
        status: "draft", // force-reprocessed run must go through review again before processed/paid
        totalEmployees,
        totalGrossSalary,
        totalDeductions,
        totalNetSalary,
        totalEmployerPF,
        totalEmployerESI,
        totalEmployeePF,
        totalEmployeeESI,
        totalTDS,
        totalPT,
        totalLWF,
        processedAt: new Date(),
        // Delete existing details and recreate
        details: {
          deleteMany: {},
          create: details,
        },
      },
      include: {
        details: {
          include: {
            employee: true,
          },
        },
      },
    });

    if (allLoanPayments.length > 0) {
      await db.loanPayment.createMany({
        data: allLoanPayments.map((lp) => ({
          loanId: lp.loanId,
          payrollRunId: payrollRun.id,
          amount: lp.amount,
          month,
          year,
        })),
      });

      // Auto-close any loan that has now collected its full term.
      const affectedLoanIds = [...new Set(allLoanPayments.map((lp) => lp.loanId))];
      for (const loanId of affectedLoanIds) {
        const loan = await db.employeeLoan.findUnique({
          where: { id: loanId },
          include: { _count: { select: { payments: true } } },
        });
        if (loan && loan._count.payments >= loan.totalMonths) {
          await db.employeeLoan.update({ where: { id: loanId }, data: { status: "closed" } });
        }
      }
    }

    if (allArrearIdsPaid.length > 0) {
      await db.salaryArrear.updateMany({
        where: { id: { in: allArrearIdsPaid } },
        data: { status: "paid", paidInRunId: payrollRun.id },
      });
    }

    if (allHiringIncentiveIdsPaid.length > 0) {
      await db.hiringIncentive.updateMany({
        where: { id: { in: allHiringIncentiveIdsPaid } },
        data: { status: "paid", paidInRunId: payrollRun.id },
      });
    }

    await logAudit({
      session,
      action: "process",
      entity: "PayrollRun",
      entityId: payrollRun.id,
      details: {
        month,
        year,
        forced: !!force,
        employeesWithCappedDeductions:
          employeesWithCappedDeductions.length > 0 ? employeesWithCappedDeductions : undefined,
      },
    });

    return NextResponse.json({
      ...payrollRun,
      warnings:
        employeesWithCappedDeductions.length > 0
          ? [
              `${employeesWithCappedDeductions.length} employee(s) had statutory deductions capped at their earned amount this period (likely incomplete attendance): ${employeesWithCappedDeductions.join(", ")}.`,
            ]
          : [],
    });
  } catch (error) {
    return handleApiError(error, "process payroll");
  }
}