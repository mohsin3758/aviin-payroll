import { db } from '@/lib/db';
import {
  calculateIncomeTax,
  STANDARD_DEDUCTION_NEW,
  STANDARD_DEDUCTION_OLD,
  SECTION_80C_CAP,
  SECTION_80D_CAP,
} from '@/lib/payroll/engine';

export class Form16Error extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** Indian financial year runs April(fyStartYear) through March(fyStartYear + 1). */
function fyMonthYearPairs(fyStartYear: number): { month: number; year: number }[] {
  const pairs: { month: number; year: number }[] = [];
  for (let m = 4; m <= 12; m++) pairs.push({ month: m, year: fyStartYear });
  for (let m = 1; m <= 3; m++) pairs.push({ month: m, year: fyStartYear + 1 });
  return pairs;
}

export async function getForm16Data(employeeId: string, fyStartYear: number) {
  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    include: { company: true },
  });

  if (!employee) {
    throw new Form16Error('Employee not found', 404);
  }

  const pairs = fyMonthYearPairs(fyStartYear);

  const details = await db.payrollDetail.findMany({
    where: {
      employeeId,
      payrollRun: {
        companyId: employee.companyId,
        OR: pairs.map((p) => ({ month: p.month, year: p.year })),
      },
    },
    include: { payrollRun: { select: { month: true, year: true } } },
  });

  if (details.length === 0) {
    throw new Form16Error(
      `No processed payroll found for this employee in FY ${fyStartYear}-${String((fyStartYear + 1) % 100).padStart(2, '0')}`,
      404
    );
  }

  details.sort((a, b) => {
    const aIdx = pairs.findIndex((p) => p.month === a.payrollRun.month && p.year === a.payrollRun.year);
    const bIdx = pairs.findIndex((p) => p.month === b.payrollRun.month && p.year === b.payrollRun.year);
    return aIdx - bIdx;
  });

  const sum = (key: keyof (typeof details)[number]) =>
    details.reduce((acc, d) => acc + (d[key] as number), 0);

  const grossSalary = {
    basic: sum('basic'),
    dearnessAllowance: sum('dearnessAllowance'),
    houseRentAllowance: sum('houseRentAllowance'),
    conveyanceAllowance: sum('conveyanceAllowance'),
    medicalAllowance: sum('medicalAllowance'),
    specialAllowance: sum('specialAllowance'),
    overtimeAllowance: sum('overtimeAllowance'),
    bonus: sum('bonus'),
    otherEarnings: sum('otherEarnings'),
    arrears: sum('arrears'),
    total: sum('totalEarnings'),
  };

  const actualEmployeePF = sum('employeePF');
  const actualEmployeeESI = sum('employeeESI');
  const actualPT = sum('professionalTax');
  const actualTDSDeducted = sum('tds');

  const regime = (employee.taxRegime as 'new' | 'old') ?? 'new';
  const standardDeduction = regime === 'new' ? STANDARD_DEDUCTION_NEW : STANDARD_DEDUCTION_OLD;

  const declaration = await db.investmentDeclaration.findUnique({
    where: { employeeId_year: { employeeId, year: fyStartYear } },
  });

  const section80C =
    regime === 'old'
      ? Math.min(SECTION_80C_CAP, actualEmployeePF + actualEmployeeESI + (declaration?.section80C ?? 0))
      : 0;
  const section80D = regime === 'old' ? Math.min(SECTION_80D_CAP, declaration?.section80D ?? 0) : 0;

  const deductionsUnderSection16 = {
    standardDeduction,
    professionalTax: actualPT,
    total: standardDeduction + actualPT,
  };

  const incomeChargeableUnderSalaries = Math.max(0, grossSalary.total - deductionsUnderSection16.total);

  const chapterVIA = { section80C, section80D, total: section80C + section80D };

  const totalTaxableIncome = Math.max(0, incomeChargeableUnderSalaries - chapterVIA.total);

  const taxResult = calculateIncomeTax(totalTaxableIncome, regime);

  return {
    employee: {
      name: `${employee.firstName} ${employee.lastName ?? ''}`.trim(),
      code: employee.employeeCode,
      pan: employee.panNumber ?? '',
      designation: employee.designation,
      email: employee.email,
    },
    company: {
      name: employee.company.name,
      address: employee.company.address ?? '',
      pan: employee.company.pan ?? '',
      tan: employee.company.tan ?? '',
    },
    financialYear: `${fyStartYear}-${String((fyStartYear + 1) % 100).padStart(2, '0')}`,
    fyStartYear,
    regime,
    monthsIncluded: details.length,
    periodCovered: details.map((d) => ({ month: d.payrollRun.month, year: d.payrollRun.year })),
    grossSalary,
    deductionsUnderSection16,
    incomeChargeableUnderSalaries,
    chapterVIA,
    totalTaxableIncome,
    taxComputation: {
      taxOnTotalIncome: taxResult.tax,
      rebate87A: taxResult.rebate,
      cess: taxResult.cess,
      totalTaxPayable: taxResult.total,
    },
    tdsDeducted: {
      totalDeducted: actualTDSDeducted,
      monthlyBreakup: details.map((d) => ({
        month: d.payrollRun.month,
        year: d.payrollRun.year,
        tds: d.tds,
      })),
    },
  };
}

export type Form16Data = Awaited<ReturnType<typeof getForm16Data>>;
