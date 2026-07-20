import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  processEmployeePayroll,
  getDaysInMonth,
  type EmployeePayrollInput,
} from "@/lib/payroll/engine";

// GET /api/payroll - List payroll runs with optional filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");
    const year = searchParams.get("year");
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (month) where.month = parseInt(month, 10);
    if (year) where.year = parseInt(year, 10);
    if (status) where.status = status;

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
    console.error("Error fetching payroll runs:", error);
    return NextResponse.json(
      { error: "Failed to fetch payroll runs" },
      { status: 500 }
    );
  }
}

// POST /api/payroll - Process payroll for a month
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { month, year, companyId } = body;

    if (!month || !year || month < 1 || month > 12) {
      return NextResponse.json(
        { error: "Valid month (1-12) and year are required" },
        { status: 400 }
      );
    }

    // 1. Get the company
    let company;
    if (companyId) {
      company = await db.company.findUnique({ where: { id: companyId } });
    } else {
      company = await db.company.findFirst();
    }

    if (!company) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    const daysInMonth = getDaysInMonth(month, year);

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
      return NextResponse.json(
        { error: "No active employees found for this company" },
        { status: 404 }
      );
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
      totalEarnings: number;
      employeePF: number;
      employerPF: number;
      employeeESI: number;
      employerESI: number;
      tds: number;
      professionalTax: number;
      lwf: number;
      totalDeductions: number;
      netSalary: number;
      grossSalary: number;
      ctc: number;
    }> = [];

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

    for (const emp of employees) {
      // Skip employees without a salary structure
      if (!emp.salaryStructure) continue;

      // 3b. Calculate presentDays from attendance
      let presentDays = 0;
      for (const record of emp.attendance) {
        if (record.status === "present") {
          presentDays += 1;
        } else if (record.status === "half-day") {
          presentDays += 0.5;
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

      // 3c. Call processEmployeePayroll
      const result = processEmployeePayroll(
        empInput,
        month,
        year,
        presentDays,
        daysInMonth
      );

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
        totalEarnings: result.totalEarnings,
        employeePF: result.employeePF,
        employerPF: result.employerPF,
        employeeESI: result.employeeESI,
        employerESI: result.employerESI,
        tds: result.tdsMonthly,
        professionalTax: result.ptAmount,
        lwf: result.lwfEmployee,
        totalDeductions: result.totalDeductions,
        netSalary: result.netSalary,
        grossSalary: result.grossSalary,
        ctc: result.ctc,
      };

      details.push(detailData);

      // Accumulate totals
      totalEmployees += 1;
      totalGrossSalary += result.grossSalary;
      totalDeductions += result.totalDeductions;
      totalNetSalary += result.netSalary;
      totalEmployerPF += result.employerPF;
      totalEmployerESI += result.employerESI;
      totalEmployeePF += result.employeePF;
      totalEmployeeESI += result.employeeESI;
      totalTDS += result.tdsMonthly;
      totalPT += result.ptAmount;
      totalLWF += result.lwfEmployee;
    }

    if (totalEmployees === 0) {
      return NextResponse.json(
        { error: "No employees with salary structures found" },
        { status: 404 }
      );
    }

    // 4. Create/update PayrollRun with aggregated totals
    const payrollRun = await db.payrollRun.upsert({
      where: {
        companyId_month_year: {
          companyId: company.id,
          month,
          year,
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

    return NextResponse.json(payrollRun);
  } catch (error) {
    console.error("Error processing payroll:", error);
    return NextResponse.json(
      { error: "Failed to process payroll" },
      { status: 500 }
    );
  }
}