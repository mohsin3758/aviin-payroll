import { db } from '@/lib/db';
import {
  processEmployeePayroll,
  calculatePF,
  getDaysInMonth,
  getMonthName,
} from '@/lib/payroll/engine';

export class SalarySlipError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function getSalarySlipData(employeeId: string, month: number, year: number) {
  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    include: { salaryStructure: true, company: true },
  });

  if (!employee) {
    throw new SalarySlipError('Employee not found', 404);
  }
  if (!employee.salaryStructure) {
    throw new SalarySlipError('Salary structure not configured for this employee', 400);
  }

  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);

  const attendanceRecords = await db.attendance.findMany({
    where: {
      employeeId,
      date: { gte: startDate, lte: endDate },
    },
    select: { status: true },
  });

  let presentDays = 0;
  for (const record of attendanceRecords) {
    if (record.status === 'present') presentDays += 1;
    else if (record.status === 'half-day') presentDays += 0.5;
  }

  const daysInMonth = getDaysInMonth(month, year);

  // Scoped to the regular monthly cycle — a salary slip must reflect the real monthly payroll,
  // never an off-cycle bonus or alternate-pay run that happens to exist for the same month.
  const payrollRun = await db.payrollRun.findFirst({
    where: { companyId: employee.companyId, month, year, runType: "regular" },
  });

  type PayrollDetailRecord = Awaited<ReturnType<typeof db.payrollDetail.findFirst>>;
  let payrollDetail: PayrollDetailRecord = null;
  if (payrollRun) {
    payrollDetail = await db.payrollDetail.findFirst({
      where: { payrollRunId: payrollRun.id, employeeId },
    });
  }

  const employeeInput = {
    id: employee.id,
    firstName: employee.firstName,
    lastName: employee.lastName ?? '',
    employeeCode: employee.employeeCode,
    designation: employee.designation,
    department: employee.department,
    state: employee.state,
    panNumber: employee.panNumber,
    pfApplicable: employee.pfApplicable,
    esiApplicable: employee.esiApplicable,
    ptApplicable: employee.ptApplicable,
    lwfApplicable: employee.lwfApplicable,
    taxRegime: employee.taxRegime as 'new' | 'old',
    gender: employee.gender,
    dateOfJoining: employee.dateOfJoining,
    salaryStructure: {
      basic: employee.salaryStructure.basic,
      dearnessAllowance: employee.salaryStructure.dearnessAllowance,
      houseRentAllowance: employee.salaryStructure.houseRentAllowance,
      conveyanceAllowance: employee.salaryStructure.conveyanceAllowance,
      medicalAllowance: employee.salaryStructure.medicalAllowance,
      specialAllowance: employee.salaryStructure.specialAllowance,
      overtimeAllowance: employee.salaryStructure.overtimeAllowance,
      bonus: employee.salaryStructure.bonus,
      otherEarnings: employee.salaryStructure.otherEarnings,
      employerPF: employee.salaryStructure.employerPF,
      employerESI: employee.salaryStructure.employerESI,
      gratuity: employee.salaryStructure.gratuity,
    },
  };

  const baseInfo = {
    employee: {
      name: `${employee.firstName} ${employee.lastName ?? ''}`.trim(),
      code: employee.employeeCode,
      designation: employee.designation,
      department: employee.department,
      pan: employee.panNumber ?? '',
      email: employee.email,
      bankName: employee.bankName ?? '',
      bankAccountNumber: employee.bankAccountNumber ?? '',
      bankIfsc: employee.bankIfsc ?? '',
    },
    company: {
      name: employee.company.name,
      address: employee.company.address ?? '',
      pan: employee.company.pan ?? '',
      tan: employee.company.tan ?? '',
    },
    month,
    year,
    monthName: getMonthName(month),
  };

  if (payrollDetail) {
    const basicDA = payrollDetail.basic + payrollDetail.dearnessAllowance;
    const pfResult = calculatePF(basicDA, employee.pfApplicable);

    const fullCalc = processEmployeePayroll(employeeInput, month, year, presentDays, daysInMonth);

    return {
      ...baseInfo,
      earnings: {
        basic: payrollDetail.basic,
        dearnessAllowance: payrollDetail.dearnessAllowance,
        houseRentAllowance: payrollDetail.houseRentAllowance,
        conveyanceAllowance: payrollDetail.conveyanceAllowance,
        medicalAllowance: payrollDetail.medicalAllowance,
        specialAllowance: payrollDetail.specialAllowance,
        overtimeAllowance: payrollDetail.overtimeAllowance,
        bonus: payrollDetail.bonus,
        otherEarnings: payrollDetail.otherEarnings,
        hiringIncentive: payrollDetail.hiringIncentive,
        totalEarnings: payrollDetail.totalEarnings,
      },
      deductions: {
        employeePF: payrollDetail.employeePF,
        employeeESI: payrollDetail.employeeESI,
        tds: payrollDetail.tds,
        professionalTax: payrollDetail.professionalTax,
        lwf: payrollDetail.lwf,
        tardinessDeduction: payrollDetail.tardinessDeduction,
        otherDeductions: payrollDetail.otherDeductions,
        totalDeductions: payrollDetail.totalDeductions,
      },
      employerContributions: {
        employerPF: payrollDetail.employerPF,
        employerEPS: pfResult.employerEPS,
        employerEDLI: pfResult.employerEDLI,
        employerESI: payrollDetail.employerESI,
      },
      totals: {
        totalEarnings: payrollDetail.totalEarnings,
        totalDeductions: payrollDetail.totalDeductions,
        netSalary: payrollDetail.netSalary,
        grossSalary: payrollDetail.grossSalary,
        ctc: payrollDetail.ctc,
      },
      taxComputation: {
        taxRegime: employee.taxRegime,
        grossAnnualSalary: fullCalc.grossAnnualSalary,
        standardDeduction: fullCalc.standardDeduction,
        taxableIncome: fullCalc.taxableIncome,
        incomeTax: fullCalc.incomeTax,
        cess: fullCalc.cess,
        rebate87A: fullCalc.rebate87A,
        totalTax: fullCalc.totalTax,
        tdsMonthly: payrollDetail.tds,
      },
      attendance: {
        daysInMonth: payrollDetail.daysInMonth,
        presentDays: payrollDetail.presentDays,
        paidDays: payrollDetail.paidDays,
      },
    };
  }

  const result = processEmployeePayroll(employeeInput, month, year, presentDays, daysInMonth);

  return {
    ...baseInfo,
    earnings: {
      basic: result.basic,
      dearnessAllowance: result.dearnessAllowance,
      houseRentAllowance: result.houseRentAllowance,
      conveyanceAllowance: result.conveyanceAllowance,
      medicalAllowance: result.medicalAllowance,
      specialAllowance: result.specialAllowance,
      overtimeAllowance: result.overtimeAllowance,
      bonus: result.bonus,
      otherEarnings: result.otherEarnings,
      hiringIncentive: 0, // no processed run yet for this month, so nothing has been paid out
      totalEarnings: result.totalEarnings,
    },
    deductions: {
      employeePF: result.employeePF,
      employeeESI: result.employeeESI,
      tds: result.tdsMonthly,
      professionalTax: result.ptAmount,
      lwf: result.lwfEmployee,
      tardinessDeduction: 0,
      otherDeductions: 0,
      totalDeductions: result.totalDeductions,
    },
    employerContributions: {
      employerPF: result.employerPF,
      employerEPS: result.employerEPS,
      employerEDLI: result.employerEDLI,
      employerESI: result.employerESI,
    },
    totals: {
      totalEarnings: result.totalEarnings,
      totalDeductions: result.totalDeductions,
      netSalary: result.netSalary,
      grossSalary: result.grossSalary,
      ctc: result.ctc,
    },
    taxComputation: {
      taxRegime: result.taxRegime,
      grossAnnualSalary: result.grossAnnualSalary,
      standardDeduction: result.standardDeduction,
      taxableIncome: result.taxableIncome,
      incomeTax: result.incomeTax,
      cess: result.cess,
      rebate87A: result.rebate87A,
      totalTax: result.totalTax,
      tdsMonthly: result.tdsMonthly,
    },
    attendance: {
      daysInMonth: result.daysInMonth,
      presentDays: result.presentDays,
      paidDays: result.paidDays,
    },
  };
}

export type SalarySlipData = Awaited<ReturnType<typeof getSalarySlipData>>;
