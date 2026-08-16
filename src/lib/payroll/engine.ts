// ============================================================
// Indian Payroll Calculation Engine
// ============================================================
// Covers: PF, ESI, TDS (New & Old Regime), Professional Tax, LWF
// Tax Year: FY 2025-26 (AY 2026-27)
// ============================================================

// --- CONSTANTS ---

export const PF_EMPLOYEE_RATE = 0.12;
export const PF_EMPLOYER_RATE = 0.12;
export const PF_EPS_RATE = 0.0833;
export const PF_EPS_CAP = 15000; // ₹15,000 wage ceiling for EPS
export const PF_EPS_MAX = 1250; // Max ₹1,250/month for EPS
export const PF_EDLI_RATE = 0.005;
export const PF_ADMIN_CHARGE_RATE = 0.01; // 1% admin charges (employer bears)
export const PF_WAGE_CEILING = 15000;

export const ESI_EMPLOYEE_RATE = 0.0075;
export const ESI_EMPLOYER_RATE = 0.0325;
export const ESI_WAGE_CEILING = 21000;

export const STANDARD_DEDUCTION_NEW = 75000;
export const STANDARD_DEDUCTION_OLD = 50000;
export const SECTION_80C_CAP = 150000;
export const SECTION_80D_CAP = 25000;
export const REBATE_87A_NEW = 60000;
export const REBATE_87A_OLD = 12500;
export const REBATE_INCOME_LIMIT_NEW = 1200000;
export const REBATE_INCOME_LIMIT_OLD = 500000;

// New Tax Regime FY 2025-26
export const NEW_TAX_SLABS = [
  { min: 0, max: 400000, rate: 0 },
  { min: 400000, max: 800000, rate: 0.05 },
  { min: 800000, max: 1200000, rate: 0.10 },
  { min: 1200000, max: 1600000, rate: 0.15 },
  { min: 1600000, max: 2000000, rate: 0.20 },
  { min: 2000000, max: 2400000, rate: 0.25 },
  { min: 2400000, max: Infinity, rate: 0.30 },
];

// Old Tax Regime FY 2025-26
export const OLD_TAX_SLABS = [
  { min: 0, max: 250000, rate: 0 },
  { min: 250000, max: 500000, rate: 0.05 },
  { min: 500000, max: 1000000, rate: 0.20 },
  { min: 1000000, max: Infinity, rate: 0.30 },
];

// Health & Education Cess
export const CESS_RATE = 0.04;

// Professional Tax - State wise (monthly rates)
export const PROFESSIONAL_TAX_SLABS: Record<string, { monthly: boolean; slabs: { limit: number; tax: number }[] }> = {
  Maharashtra: {
    monthly: true,
    slabs: [
      { limit: 7500, tax: 0 },
      { limit: 10000, tax: 175 },
      { limit: Infinity, tax: 200 }, // ₹300 in Feb (last month)
    ],
  },
  Karnataka: {
    monthly: true,
    slabs: [
      { limit: 15000, tax: 0 },
      { limit: 20000, tax: 150 },
      { limit: Infinity, tax: 200 },
    ],
  },
  "Tamil Nadu": {
    monthly: false, // half-yearly
    slabs: [
      { limit: 21000, tax: 0 },
      { limit: 30000, tax: 135 }, // per half-year
      { limit: 45000, tax: 315 },
      { limit: 60000, tax: 690 },
      { limit: Infinity, tax: 1025 },
    ],
  },
  "Andhra Pradesh": {
    monthly: true,
    slabs: [
      { limit: 15000, tax: 0 },
      { limit: 20000, tax: 150 },
      { limit: Infinity, tax: 200 },
    ],
  },
  Telangana: {
    monthly: true,
    slabs: [
      { limit: 15000, tax: 0 },
      { limit: 20000, tax: 150 },
      { limit: Infinity, tax: 200 },
    ],
  },
  Gujarat: {
    monthly: true,
    slabs: [
      { limit: 5999, tax: 0 },
      { limit: 8999, tax: 80 },
      { limit: 11999, tax: 150 },
      { limit: Infinity, tax: 200 },
    ],
  },
  "West Bengal": {
    monthly: true,
    slabs: [
      { limit: 10000, tax: 0 },
      { limit: 15000, tax: 110 },
      { limit: 25000, tax: 130 },
      { limit: 40000, tax: 150 },
      { limit: Infinity, tax: 200 },
    ],
  },
  Kerala: {
    monthly: true,
    slabs: [
      { limit: 9999, tax: 0 },
      { limit: 14999, tax: 120 },
      { limit: 19999, tax: 180 },
      { limit: 24999, tax: 230 },
      { limit: Infinity, tax: 300 },
    ],
  },
  Punjab: {
    monthly: true,
    slabs: [
      { limit: 15000, tax: 0 },
      { limit: 20000, tax: 150 },
      { limit: Infinity, tax: 200 },
    ],
  },
  Rajasthan: {
    monthly: true,
    slabs: [
      { limit: 7500, tax: 0 },
      { limit: 10000, tax: 175 },
      { limit: Infinity, tax: 200 },
    ],
  },
  "Madhya Pradesh": {
    monthly: true,
    slabs: [
      { limit: 187500, tax: 0 }, // Not applicable in MP
      { limit: Infinity, tax: 0 },
    ],
  },
  Delhi: {
    monthly: true,
    slabs: [
      { limit: Infinity, tax: 0 }, // Not applicable in Delhi
    ],
  },
  "Uttar Pradesh": {
    monthly: true,
    slabs: [
      { limit: Infinity, tax: 0 }, // Not applicable in UP
    ],
  },
  Haryana: {
    monthly: true,
    slabs: [
      { limit: 15000, tax: 0 },
      { limit: 20000, tax: 150 },
      { limit: Infinity, tax: 200 },
    ],
  },
  Goa: {
    monthly: true,
    slabs: [
      { limit: 15000, tax: 0 },
      { limit: 20000, tax: 150 },
      { limit: Infinity, tax: 200 },
    ],
  },
  Odisha: {
    monthly: true,
    slabs: [
      { limit: 12500, tax: 0 },
      { limit: 15000, tax: 125 },
      { limit: 25000, tax: 200 },
      { limit: Infinity, tax: 0 }, // Not levied above 25k
    ],
  },
  "Chhattisgarh": {
    monthly: true,
    slabs: [
      { limit: 10000, tax: 0 },
      { limit: 15000, tax: 150 },
      { limit: Infinity, tax: 200 },
    ],
  },
};

// LWF Rates by State
export const LWF_RATES: Record<string, { employee: number; employer: number; frequency: string; wageCeiling?: number; notes?: string }> = {
  Maharashtra: { employee: 6, employer: 12, frequency: "half-yearly", wageCeiling: 3000 },
  Karnataka: { employee: 50, employer: 100, frequency: "annual", wageCeiling: Infinity, notes: "Due by Jan 15" },
  Gujarat: { employee: 3, employer: 6, frequency: "half-yearly", wageCeiling: Infinity },
  "Tamil Nadu": { employee: 20, employer: 40, frequency: "half-yearly", wageCeiling: 15000 },
  "Madhya Pradesh": { employee: 5, employer: 10, frequency: "half-yearly", wageCeiling: Infinity },
  Kerala: { employee: 10, employer: 20, frequency: "half-yearly", wageCeiling: Infinity },
  Haryana: { employee: 17, employer: 34, frequency: "monthly", wageCeiling: Infinity, notes: "Enhanced Jan 2025" },
  Punjab: { employee: 4, employer: 8, frequency: "half-yearly", wageCeiling: 3000 },
  "West Bengal": { employee: 10, employer: 20, frequency: "half-yearly", wageCeiling: Infinity },
  "Andhra Pradesh": { employee: 4, employer: 8, frequency: "half-yearly", wageCeiling: Infinity },
  Telangana: { employee: 4, employer: 8, frequency: "half-yearly", wageCeiling: Infinity },
  Odisha: { employee: 15, employer: 30, frequency: "annual", wageCeiling: Infinity },
  Goa: { employee: 12, employer: 24, frequency: "half-yearly", wageCeiling: Infinity },
  "Chhattisgarh": { employee: 10, employer: 20, frequency: "annual", wageCeiling: Infinity },
  Delhi: { employee: 25, employer: 50, frequency: "half-yearly", wageCeiling: Infinity },
};

// --- TYPES ---

export interface SalaryStructureInput {
  basic: number;
  dearnessAllowance: number;
  houseRentAllowance: number;
  conveyanceAllowance: number;
  medicalAllowance: number;
  specialAllowance: number;
  overtimeAllowance: number;
  bonus: number;
  otherEarnings: number;
  employerPF: number;
  employerESI: number;
  gratuity: number;
}

export interface EmployeePayrollInput {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  designation: string;
  department: string;
  state: string;
  panNumber: string | null;
  pfApplicable: boolean;
  esiApplicable: boolean;
  ptApplicable: boolean;
  lwfApplicable: boolean;
  taxRegime: "new" | "old";
  gender: string;
  dateOfJoining: Date;
  salaryStructure: SalaryStructureInput;
}

export interface PayrollResult {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  designation: string;
  department: string;
  daysInMonth: number;
  presentDays: number;
  paidDays: number;

  // Earnings
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

  // Statutory Details
  pfWages: number; // Basic + DA (for PF calculation)
  esiWages: number; // Gross salary (for ESI calculation)
  employeePFRate: number;
  employerPFRate: number;
  employeePF: number;
  employerPF: number;
  employerEPS: number;
  employerEDLI: number;
  employeeESIRate: number;
  employerESIRate: number;
  employeeESI: number;
  employerESI: number;
  ptAmount: number;
  lwfEmployee: number;
  lwfEmployer: number;

  // Tax
  taxRegime: string;
  grossAnnualSalary: number;
  taxableIncome: number;
  incomeTax: number;
  cess: number;
  totalTax: number;
  tdsMonthly: number;
  standardDeduction: number;
  rebate87A: number;

  // Totals
  totalDeductions: number;
  deductionsCapped: boolean;
  netSalary: number;
  grossSalary: number;
  ctc: number;
}

// --- CALCULATION FUNCTIONS ---

export function calculateGrossSalary(ss: SalaryStructureInput): number {
  return (
    ss.basic +
    ss.dearnessAllowance +
    ss.houseRentAllowance +
    ss.conveyanceAllowance +
    ss.medicalAllowance +
    ss.specialAllowance +
    ss.overtimeAllowance +
    ss.bonus +
    ss.otherEarnings
  );
}

export function calculateCTC(ss: SalaryStructureInput): number {
  const gross = calculateGrossSalary(ss);
  return gross * 12 + ss.employerPF * 12 + ss.employerESI * 12 + ss.gratuity * 12;
}

export function calculatePF(basicDA: number, isApplicable: boolean): { employeePF: number; employerPF: number; employerEPS: number; employerEDLI: number } {
  if (!isApplicable) return { employeePF: 0, employerPF: 0, employerEPS: 0, employerEDLI: 0 };

  // PF is calculated on actual Basic + DA (no ceiling restriction for employer if they choose to pay on actual)
  // But EPS is capped at ₹15,000 wages
  const pfWages = basicDA;
  const epsWages = Math.min(basicDA, PF_EPS_CAP);

  const employeePF = Math.round(pfWages * PF_EMPLOYEE_RATE);
  const employerEPS = Math.min(Math.round(epsWages * PF_EPS_RATE), PF_EPS_MAX);
  const employerEDLI = Math.round(Math.min(pfWages, PF_WAGE_CEILING) * PF_EDLI_RATE);
  const employerPF = Math.round(pfWages * PF_EMPLOYER_RATE) - employerEPS - employerEDLI;

  return { employeePF, employerPF, employerEPS, employerEDLI };
}

export function calculateESI(grossSalary: number, isApplicable: boolean): { employeeESI: number; employerESI: number } {
  if (!isApplicable || grossSalary > ESI_WAGE_CEILING) {
    return { employeeESI: 0, employerESI: 0 };
  }

  const employeeESI = Math.round(grossSalary * ESI_EMPLOYEE_RATE);
  const employerESI = Math.round(grossSalary * ESI_EMPLOYER_RATE);

  return { employeeESI, employerESI };
}

export function calculateProfessionalTax(monthlySalary: number, state: string, month: number, isApplicable: boolean): number {
  if (!isApplicable) return 0;

  const stateConfig = PROFESSIONAL_TAX_SLABS[state];
  if (!stateConfig) return 0;

  let tax = 0;
  for (const slab of stateConfig.slabs) {
    if (monthlySalary <= slab.limit) {
      tax = slab.tax;
      break;
    }
  }

  // February surcharge (last month of FY in some states like Maharashtra - ₹300 instead of ₹200)
  if (state === "Maharashtra" && month === 2 && tax === 200) {
    tax = 300;
  }

  return tax;
}

export function calculateLWF(state: string, isApplicable: boolean, month: number): { employee: number; employer: number } {
  if (!isApplicable) return { employee: 0, employer: 0 };

  const lwfConfig = LWF_RATES[state];
  if (!lwfConfig) return { employee: 0, employer: 0 };

  // LWF is collected only in specific months based on frequency
  let shouldCollect = false;
  switch (lwfConfig.frequency) {
    case "monthly":
      shouldCollect = true;
      break;
    case "half-yearly":
      // June and December
      shouldCollect = month === 6 || month === 12;
      break;
    case "annual":
      // January for Karnataka, December for Odisha
      if (state === "Karnataka") shouldCollect = month === 1;
      else if (state === "Odisha") shouldCollect = month === 12;
      else shouldCollect = month === 6;
      break;
  }

  if (!shouldCollect) return { employee: 0, employer: 0 };

  return { employee: lwfConfig.employee, employer: lwfConfig.employer };
}

export function calculateIncomeTax(annualTaxableIncome: number, regime: "new" | "old"): { tax: number; cess: number; total: number; rebate: number } {
  const slabs = regime === "new" ? NEW_TAX_SLABS : OLD_TAX_SLABS;
  const stdDeduction = regime === "new" ? STANDARD_DEDUCTION_NEW : STANDARD_DEDUCTION_OLD;
  const rebateAmount = regime === "new" ? REBATE_87A_NEW : REBATE_87A_OLD;
  const rebateLimit = regime === "new" ? REBATE_INCOME_LIMIT_NEW : REBATE_INCOME_LIMIT_OLD;

  let tax = 0;
  for (const slab of slabs) {
    if (annualTaxableIncome <= slab.min) break;
    const taxableInSlab = Math.min(annualTaxableIncome, slab.max) - slab.min;
    tax += taxableInSlab * slab.rate;
  }

  // Section 87A Rebate
  let rebate = 0;
  if (annualTaxableIncome <= rebateLimit) {
    rebate = Math.min(tax, rebateAmount);
    tax -= rebate;
  }

  // Round tax to nearest ₹10 (as per IT rules)
  tax = Math.ceil(tax / 10) * 10;

  const cess = Math.round(tax * CESS_RATE);

  return { tax, cess, total: tax + cess, rebate };
}

export const OVERTIME_MULTIPLIER = 1.5;
export const STANDARD_HOURS_PER_DAY = 8;

/**
 * Overtime pay for hours actually worked beyond the standard 8/day, computed on the
 * employee's standing (non-prorated) Basic+DA — this is additive to any manually-set
 * overtimeAllowance on the salary structure, not a replacement for it.
 */
export function calculateOvertimePay(
  standingBasicDA: number,
  overtimeHours: number,
  daysInMonth: number
): number {
  if (overtimeHours <= 0 || daysInMonth <= 0) return 0;
  const hourlyRate = standingBasicDA / (daysInMonth * STANDARD_HOURS_PER_DAY);
  return Math.round(hourlyRate * overtimeHours * OVERTIME_MULTIPLIER);
}

export interface InvestmentDeclarationInput {
  section80C: number;
  section80D: number;
}

export function processEmployeePayroll(
  emp: EmployeePayrollInput,
  month: number,
  year: number,
  presentDays: number,
  daysInMonth: number,
  overtimeHours: number = 0,
  investmentDeclaration: InvestmentDeclarationInput = { section80C: 0, section80D: 0 }
): PayrollResult {
  const ss = emp.salaryStructure;
  const paidDays = Math.min(presentDays, daysInMonth);
  const prorationFactor = daysInMonth > 0 ? paidDays / daysInMonth : 1;

  // Pro-rated earnings
  const basic = Math.round(ss.basic * prorationFactor);
  const da = Math.round(ss.dearnessAllowance * prorationFactor);
  const hra = Math.round(ss.houseRentAllowance * prorationFactor);
  const conveyance = Math.round(ss.conveyanceAllowance * prorationFactor);
  const medical = Math.round(ss.medicalAllowance * prorationFactor);
  const special = Math.round(ss.specialAllowance * prorationFactor);
  const computedOvertimePay = calculateOvertimePay(ss.basic + ss.dearnessAllowance, overtimeHours, daysInMonth);
  const overtime = Math.round(ss.overtimeAllowance * prorationFactor) + computedOvertimePay;
  const bonus = Math.round(ss.bonus * prorationFactor);
  const other = Math.round(ss.otherEarnings * prorationFactor);

  const totalEarnings = basic + da + hra + conveyance + medical + special + overtime + bonus + other;

  // PF calculation on Basic + DA
  const basicDA = basic + da;
  const pfResult = calculatePF(basicDA, emp.pfApplicable);

  // ESI on Gross Salary (full month gross for eligibility, but deduction on actual)
  const grossSalary = calculateGrossSalary(ss);
  const esiWages = totalEarnings; // Use prorated gross for deduction
  const esiResult = calculateESI(grossSalary, emp.esiApplicable);

  // Professional Tax on full month gross
  const ptAmount = calculateProfessionalTax(grossSalary, emp.state, month, emp.ptApplicable);

  // LWF
  const lwfResult = calculateLWF(emp.state, emp.lwfApplicable, month);

  // TDS Calculation
  const grossAnnual = grossSalary * 12;
  const stdDeduction = emp.taxRegime === "new" ? STANDARD_DEDUCTION_NEW : STANDARD_DEDUCTION_OLD;
  const annualPF = pfResult.employeePF * 12;
  const annualESI = esiResult.employeeESI * 12;
  const annualPT = (() => {
    // Approximate annual PT
    const monthlyPT = calculateProfessionalTax(grossSalary, emp.state, 1, emp.ptApplicable);
    // Account for Feb surcharge in Maharashtra
    if (emp.state === "Maharashtra") return monthlyPT * 11 + 300;
    const stateConfig = PROFESSIONAL_TAX_SLABS[emp.state];
    if (stateConfig && !stateConfig.monthly) return monthlyPT * 2; // half-yearly
    return monthlyPT * 12;
  })();

  // Section 80C combines PF + ESI + any declared investments (LIC, PPF, ELSS, etc.), capped at
  // ₹1.5L total — not each counted separately without limit. 80D (health insurance) is a
  // separate cap. Both only apply under the old regime; the new regime only gets the standard
  // deduction.
  const section80C = Math.min(SECTION_80C_CAP, annualPF + annualESI + investmentDeclaration.section80C);
  const section80D = Math.min(SECTION_80D_CAP, investmentDeclaration.section80D);

  let taxableIncome = grossAnnual - stdDeduction - section80C - section80D - annualPT;
  if (emp.taxRegime === "new") {
    taxableIncome = grossAnnual - stdDeduction; // Only standard deduction in new regime
  }
  taxableIncome = Math.max(0, taxableIncome);

  const taxResult = calculateIncomeTax(taxableIncome, emp.taxRegime);
  // The annual tax projection above is deliberately based on the employee's standing (full-month)
  // salary, not this month's prorated earnings — that's the correct steady-state annual estimate.
  // But the monthly *installment* collected must be scaled down by the same paid-days ratio as
  // earnings, or a partial month (new joiner, extended leave, resignation mid-month) gets hit with
  // a full month's TDS bite against a fraction of a month's pay (previously produced absurd
  // effective tax rates, e.g. 65% of a 4-paid-day month's earnings).
  const tdsMonthly = Math.round((taxResult.total / 12) * prorationFactor);

  // Total deductions
  // PT/ESI are computed from the employee's standing (full-month) salary structure — a
  // reasonable approximation in a normal month (PT slabs and ESI eligibility are standing-salary
  // based per Indian practice, not prorated), but if attendance-based proration has already
  // reduced totalEarnings to less than the standing deductions (e.g. presentDays=0, unpaid leave,
  // new joiner mid-month), deductions must never exceed what was actually earned that month.
  //
  // Deliberate, explicit company policy (confirmed after flagging that this is not standard
  // statutory practice — under the EPF/ESI Acts the employer's contribution is legally the
  // employer's own cost and cannot ordinarily be recovered from an employee's wages): BOTH the
  // employee's own share AND the employer's matching share of PF, ESI, and LWF are netted
  // against take-home Net Pay here (Net Pay = Gross - Employee PF - Employer PF - Employee ESI -
  // Employer ESI - TDS - PT - Employee LWF - Employer LWF). TDS and PT have no employer-side
  // component in Indian payroll, so only the employee amount applies to those two. Gross Salary
  // and CTC still separately report the full employer cost regardless of this — this only
  // changes what actually reaches the employee's bank account.
  const employerPFMonthly = pfResult.employeePF; // Employer matches
  const employerESIMonthly = esiResult.employerESI;
  const employerLWFMonthly = lwfResult.employer;
  const rawTotalDeductions =
    pfResult.employeePF + employerPFMonthly + esiResult.employeeESI + employerESIMonthly + tdsMonthly + ptAmount + lwfResult.employee + employerLWFMonthly;
  const totalDeductions = Math.min(rawTotalDeductions, totalEarnings);
  const deductionsCapped = rawTotalDeductions > totalEarnings;

  // Net salary
  const netSalary = totalEarnings - totalDeductions;

  const ctcMonthly = totalEarnings + employerPFMonthly + employerESIMonthly + ss.gratuity;

  return {
    employeeId: emp.id,
    employeeCode: emp.employeeCode,
    employeeName: `${emp.firstName} ${emp.lastName || ""}`.trim(),
    designation: emp.designation,
    department: emp.department,
    daysInMonth,
    presentDays,
    paidDays,
    basic,
    dearnessAllowance: da,
    houseRentAllowance: hra,
    conveyanceAllowance: conveyance,
    medicalAllowance: medical,
    specialAllowance: special,
    overtimeAllowance: overtime,
    bonus,
    otherEarnings: other,
    totalEarnings,
    pfWages: basicDA,
    esiWages: grossSalary,
    employeePFRate: emp.pfApplicable ? PF_EMPLOYEE_RATE : 0,
    employerPFRate: emp.pfApplicable ? PF_EMPLOYER_RATE : 0,
    employeePF: pfResult.employeePF,
    employerPF: pfResult.employerPF,
    employerEPS: pfResult.employerEPS,
    employerEDLI: pfResult.employerEDLI,
    employeeESIRate: emp.esiApplicable ? ESI_EMPLOYEE_RATE : 0,
    employerESIRate: emp.esiApplicable ? ESI_EMPLOYER_RATE : 0,
    employeeESI: esiResult.employeeESI,
    employerESI: esiResult.employerESI,
    ptAmount,
    lwfEmployee: lwfResult.employee,
    lwfEmployer: lwfResult.employer,
    taxRegime: emp.taxRegime,
    grossAnnualSalary: grossAnnual,
    taxableIncome,
    incomeTax: taxResult.tax,
    cess: taxResult.cess,
    totalTax: taxResult.total,
    tdsMonthly,
    standardDeduction: stdDeduction,
    rebate87A: taxResult.rebate,
    totalDeductions,
    deductionsCapped,
    netSalary,
    grossSalary: totalEarnings,
    ctc: ctcMonthly,
  };
}

// Helper: Get days in month
export function getDaysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

// ============================================================
// Alternate pay modes: daily wage, hourly, contractor
// ============================================================
// These bypass the monthly slab-based salaried engine above entirely — no PF/ESI/PT/LWF/TDS
// slab computation, since daily-wage/hourly/contractor workers are paid per unit worked (or a
// flat invoiced amount for contractors) rather than a prorated standing monthly structure.

// Default TDS rate for contractor payments, u/s 194J (professional/technical fees). Real
// contract-work payments (194C) are often 1-2% instead — which section actually applies
// depends on the nature of the engagement and requires case-by-case CA/legal judgment, so this
// is deliberately exposed as a configurable rate rather than a silently-assumed determination.
export const CONTRACTOR_TDS_RATE = 0.10;

export type AlternateWageType = "daily_wage" | "hourly" | "contractor";

export interface AlternatePayrollResult {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  wageType: AlternateWageType;
  unitsWorked: number; // days, hours, or invoiced units depending on wageType
  rate: number;
  grossPay: number;
  tds: number;
  netPay: number;
}

export function calculateDailyWagePay(dailyRate: number, daysWorked: number): number {
  return Math.round(dailyRate * daysWorked);
}

export function calculateHourlyWagePay(hourlyRate: number, hoursWorked: number): number {
  return Math.round(hourlyRate * hoursWorked);
}

export function processAlternateEmployeePayroll(
  emp: { id: string; employeeCode: string; firstName: string; lastName: string | null },
  wageType: AlternateWageType,
  rate: number,
  unitsWorked: number,
  contractorTdsRate: number = CONTRACTOR_TDS_RATE
): AlternatePayrollResult {
  const grossPay =
    wageType === "daily_wage"
      ? calculateDailyWagePay(rate, unitsWorked)
      : wageType === "hourly"
        ? calculateHourlyWagePay(rate, unitsWorked)
        : Math.round(rate * unitsWorked); // contractor: rate is a flat per-unit/invoice amount

  const tds = wageType === "contractor" ? Math.round(grossPay * contractorTdsRate) : 0;
  const netPay = grossPay - tds;

  return {
    employeeId: emp.id,
    employeeCode: emp.employeeCode,
    employeeName: `${emp.firstName} ${emp.lastName ?? ""}`.trim(),
    wageType,
    unitsWorked,
    rate,
    grossPay,
    tds,
    netPay,
  };
}

// Helper: Get month name
export function getMonthName(month: number): string {
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return months[month - 1];
}

// Helper: Format currency (INR)
export function formatINR(amount: number): string {
  if (amount === 0) return "₹0";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// Helper: Format currency with decimals
export function formatINRDecimal(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}