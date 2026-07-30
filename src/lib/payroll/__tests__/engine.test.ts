import { describe, it, expect } from "vitest";
import {
  calculatePF,
  calculateESI,
  calculateProfessionalTax,
  calculateLWF,
  calculateIncomeTax,
  calculateGrossSalary,
  calculateOvertimePay,
  processEmployeePayroll,
  getDaysInMonth,
  calculateDailyWagePay,
  calculateHourlyWagePay,
  processAlternateEmployeePayroll,
  CONTRACTOR_TDS_RATE,
  type EmployeePayrollInput,
  type SalaryStructureInput,
} from "../engine";

describe("calculatePF", () => {
  it("returns zero when not applicable", () => {
    expect(calculatePF(20000, false)).toEqual({
      employeePF: 0,
      employerPF: 0,
      employerEPS: 0,
      employerEDLI: 0,
    });
  });

  it("computes 12% employee PF on basic+DA below the EPS ceiling", () => {
    const result = calculatePF(15000, true);
    expect(result.employeePF).toBe(1800); // 12% of 15000
    expect(result.employerEPS).toBe(1250); // capped at 15000 * 8.33% ~= 1250
  });

  it("caps employer EPS contribution at the wage ceiling even for high basic+DA", () => {
    const result = calculatePF(50000, true);
    expect(result.employeePF).toBe(6000); // 12% of 50000, no ceiling on employee side
    expect(result.employerEPS).toBeLessThanOrEqual(1250); // EPS capped regardless of actual wages
  });
});

describe("calculateESI", () => {
  it("returns zero when not applicable", () => {
    expect(calculateESI(18000, false)).toEqual({ employeeESI: 0, employerESI: 0 });
  });

  it("returns zero when gross salary exceeds the wage ceiling (21000)", () => {
    expect(calculateESI(21001, true)).toEqual({ employeeESI: 0, employerESI: 0 });
  });

  it("computes 0.75%/3.25% split at exactly the ceiling", () => {
    const result = calculateESI(21000, true);
    expect(result.employeeESI).toBe(158); // round(21000 * 0.0075)
    expect(result.employerESI).toBe(683); // round(21000 * 0.0325)
  });
});

describe("calculateProfessionalTax", () => {
  it("returns zero when not applicable", () => {
    expect(calculateProfessionalTax(30000, "Maharashtra", 5, false)).toBe(0);
  });

  it("returns zero for a state with no PT config", () => {
    expect(calculateProfessionalTax(30000, "Sikkim-Nonexistent", 5, true)).toBe(0);
  });

  it("applies the Maharashtra February surcharge (300 instead of 200)", () => {
    const normalMonth = calculateProfessionalTax(30000, "Maharashtra", 5, true);
    const february = calculateProfessionalTax(30000, "Maharashtra", 2, true);
    expect(normalMonth).toBe(200);
    expect(february).toBe(300);
  });
});

describe("calculateLWF", () => {
  it("returns zero when not applicable", () => {
    expect(calculateLWF("Maharashtra", false, 6)).toEqual({ employee: 0, employer: 0 });
  });

  it("only collects half-yearly LWF in June/December, not other months", () => {
    const june = calculateLWF("Maharashtra", true, 6);
    const march = calculateLWF("Maharashtra", true, 3);
    expect(june.employee).toBeGreaterThan(0);
    expect(march).toEqual({ employee: 0, employer: 0 });
  });
});

describe("calculateIncomeTax", () => {
  it("applies the section 87A rebate under the new regime for income at/below the threshold", () => {
    const result = calculateIncomeTax(1100000, "new");
    expect(result.rebate).toBeGreaterThan(0);
    expect(result.total).toBe(0); // fully rebated
  });

  it("charges tax above the new-regime rebate threshold", () => {
    const result = calculateIncomeTax(1500000, "new");
    expect(result.total).toBeGreaterThan(0);
  });

  it("never returns negative tax for zero income", () => {
    const result = calculateIncomeTax(0, "new");
    expect(result.total).toBe(0);
    expect(result.tax).toBe(0);
  });
});

describe("calculateOvertimePay", () => {
  it("returns zero for zero or negative overtime hours", () => {
    expect(calculateOvertimePay(30000, 0, 31)).toBe(0);
    expect(calculateOvertimePay(30000, -5, 31)).toBe(0);
  });

  it("pays 1.5x the hourly rate for overtime hours", () => {
    // hourly rate = 30000 / (30*8) = 125; 10 OT hours * 125 * 1.5 = 1875
    const pay = calculateOvertimePay(30000, 10, 30);
    expect(pay).toBe(1875);
  });

  it("scales linearly with more overtime hours", () => {
    const five = calculateOvertimePay(30000, 5, 30);
    const ten = calculateOvertimePay(30000, 10, 30);
    // Each is independently rounded, so allow for +/-1 rounding slack rather than exact equality.
    expect(Math.abs(ten - five * 2)).toBeLessThanOrEqual(1);
  });
});

describe("getDaysInMonth", () => {
  it("returns 31 for January", () => {
    expect(getDaysInMonth(1, 2026)).toBe(31);
  });

  it("returns 28 for February in a non-leap year", () => {
    expect(getDaysInMonth(2, 2026)).toBe(28);
  });

  it("returns 29 for February in a leap year", () => {
    expect(getDaysInMonth(2, 2024)).toBe(29);
  });
});

function buildEmployee(overrides: Partial<EmployeePayrollInput> = {}): EmployeePayrollInput {
  const salaryStructure: SalaryStructureInput = {
    basic: 30000,
    dearnessAllowance: 0,
    houseRentAllowance: 12000,
    conveyanceAllowance: 1600,
    medicalAllowance: 1250,
    specialAllowance: 5000,
    overtimeAllowance: 0,
    bonus: 0,
    otherEarnings: 0,
    employerPF: 3600,
    employerESI: 0,
    gratuity: 0,
  };

  return {
    id: "emp-1",
    firstName: "Test",
    lastName: "Employee",
    employeeCode: "EMP001",
    designation: "Engineer",
    department: "Engineering",
    state: "Maharashtra",
    panNumber: "ABCPS1234K",
    pfApplicable: true,
    esiApplicable: false,
    ptApplicable: true,
    lwfApplicable: false,
    taxRegime: "new",
    gender: "male",
    dateOfJoining: new Date("2022-01-01"),
    salaryStructure,
    ...overrides,
  };
}

describe("processEmployeePayroll", () => {
  it("computes a full-attendance month with no statutory deduction exceeding earnings", () => {
    const emp = buildEmployee();
    const result = processEmployeePayroll(emp, 7, 2026, 31, 31);
    expect(result.presentDays).toBe(31);
    expect(result.totalEarnings).toBe(calculateGrossSalary(emp.salaryStructure));
    expect(result.netSalary).toBeGreaterThan(0);
    expect(result.deductionsCapped).toBe(false);
  });

  it("nets the full employer PF contribution against take-home Net Pay, matching this company's payroll convention (Net Pay = Gross - Employee PF - ESI - Employer PF Deduction - TDS - PT - LWF)", () => {
    const emp = buildEmployee();
    const result = processEmployeePayroll(emp, 7, 2026, 31, 31);
    const employerPFContribution = result.employerPF + result.employerEPS + result.employerEDLI;
    expect(employerPFContribution).toBe(result.employeePF); // same 12% rate on the same wage base, by construction
    const expectedTotalDeductions =
      result.employeePF + employerPFContribution + result.employeeESI + result.tdsMonthly + result.ptAmount + result.lwfEmployee;
    expect(result.totalDeductions).toBe(expectedTotalDeductions);
    expect(result.netSalary).toBe(result.totalEarnings - result.totalDeductions);
    // Gross Salary and CTC are unaffected — only take-home Net Pay nets against employer PF.
    expect(result.grossSalary).toBe(result.totalEarnings);
  });

  it("adds computed overtime pay on top of the standing overtimeAllowance", () => {
    const emp = buildEmployee();
    const noOvertime = processEmployeePayroll(emp, 7, 2026, 31, 31, 0);
    const withOvertime = processEmployeePayroll(emp, 7, 2026, 31, 31, 10);
    expect(withOvertime.overtimeAllowance).toBeGreaterThan(noOvertime.overtimeAllowance);
    expect(withOvertime.totalEarnings).toBeGreaterThan(noOvertime.totalEarnings);
  });

  it("never produces a negative net salary when presentDays is 0 (regression test)", () => {
    const emp = buildEmployee();
    const result = processEmployeePayroll(emp, 8, 2026, 0, 31);
    expect(result.totalEarnings).toBe(0);
    expect(result.totalDeductions).toBe(0); // capped at totalEarnings
    expect(result.netSalary).toBe(0);
    expect(result.netSalary).toBeGreaterThanOrEqual(0);
    expect(result.deductionsCapped).toBe(true);
  });

  it("prorates earnings linearly with presentDays", () => {
    const emp = buildEmployee();
    const half = processEmployeePayroll(emp, 7, 2026, 15.5, 31);
    const full = processEmployeePayroll(emp, 7, 2026, 31, 31);
    expect(half.totalEarnings).toBeCloseTo(full.totalEarnings / 2, -1); // within rounding
  });

  it("caps paidDays at daysInMonth even if presentDays overcounts", () => {
    const emp = buildEmployee();
    const result = processEmployeePayroll(emp, 7, 2026, 45, 31);
    expect(result.paidDays).toBe(31);
  });

  it("declared 80C/80D investments reduce old-regime taxable income and TDS (regression: previously only PF+ESI counted)", () => {
    const emp = buildEmployee({ taxRegime: "old" });
    const withoutDeclaration = processEmployeePayroll(emp, 7, 2026, 31, 31, 0, { section80C: 0, section80D: 0 });
    const withDeclaration = processEmployeePayroll(emp, 7, 2026, 31, 31, 0, { section80C: 150000, section80D: 25000 });
    expect(withDeclaration.taxableIncome).toBeLessThan(withoutDeclaration.taxableIncome);
    expect(withDeclaration.tdsMonthly).toBeLessThanOrEqual(withoutDeclaration.tdsMonthly);
  });

  it("caps combined 80C (PF+ESI+declared) at 1.5L even when declared investments alone exceed it", () => {
    const emp = buildEmployee({ taxRegime: "old" });
    // Declaring an absurdly large 80C amount must not reduce taxable income below what the cap allows.
    const atCap = processEmployeePayroll(emp, 7, 2026, 31, 31, 0, { section80C: 150000, section80D: 0 });
    const wayOverCap = processEmployeePayroll(emp, 7, 2026, 31, 31, 0, { section80C: 500000, section80D: 0 });
    expect(wayOverCap.taxableIncome).toBe(atCap.taxableIncome);
  });

  it("new regime ignores investment declarations entirely", () => {
    const emp = buildEmployee({ taxRegime: "new" });
    const withoutDeclaration = processEmployeePayroll(emp, 7, 2026, 31, 31, 0, { section80C: 0, section80D: 0 });
    const withDeclaration = processEmployeePayroll(emp, 7, 2026, 31, 31, 0, { section80C: 150000, section80D: 25000 });
    expect(withDeclaration.taxableIncome).toBe(withoutDeclaration.taxableIncome);
  });
});

describe("alternate pay modes (daily wage / hourly / contractor)", () => {
  const emp = { id: "e1", employeeCode: "EMP0099", firstName: "Alt", lastName: "Worker" };

  it("calculates daily wage pay as rate x days worked", () => {
    expect(calculateDailyWagePay(800, 22)).toBe(17600);
  });

  it("calculates hourly pay as rate x hours worked", () => {
    expect(calculateHourlyWagePay(150, 37.5)).toBe(5625);
  });

  it("daily-wage employees have no TDS deducted", () => {
    const result = processAlternateEmployeePayroll(emp, "daily_wage", 800, 22);
    expect(result.grossPay).toBe(17600);
    expect(result.tds).toBe(0);
    expect(result.netPay).toBe(17600);
  });

  it("hourly employees have no TDS deducted", () => {
    const result = processAlternateEmployeePayroll(emp, "hourly", 150, 40);
    expect(result.grossPay).toBe(6000);
    expect(result.tds).toBe(0);
    expect(result.netPay).toBe(6000);
  });

  it("contractor payments deduct TDS at the configured rate (default 10%, u/s 194J)", () => {
    const result = processAlternateEmployeePayroll(emp, "contractor", 1, 50000);
    expect(result.grossPay).toBe(50000);
    expect(result.tds).toBe(Math.round(50000 * CONTRACTOR_TDS_RATE));
    expect(result.netPay).toBe(50000 - result.tds);
  });

  it("contractor TDS rate is configurable (e.g. 1% for 194C contract work)", () => {
    const result = processAlternateEmployeePayroll(emp, "contractor", 1, 50000, 0.01);
    expect(result.tds).toBe(500);
    expect(result.netPay).toBe(49500);
  });
});
