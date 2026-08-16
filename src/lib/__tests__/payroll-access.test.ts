import { describe, it, expect } from "vitest";
import { hasFeature, inEmployeeScope, assertEmployeeInScope, filterToScope, type PayrollRestriction } from "../payroll-access";

const unrestricted: PayrollRestriction = { features: null, employeeIds: null };
const restricted: PayrollRestriction = {
  features: new Set(["view_reports"]),
  employeeIds: new Set(["emp-1", "emp-2"]),
};

describe("hasFeature", () => {
  it("allows any feature when unrestricted (features: null)", () => {
    expect(hasFeature(unrestricted, "process_payroll")).toBe(true);
    expect(hasFeature(unrestricted, "manage_arrears")).toBe(true);
  });

  it("allows only listed features when restricted", () => {
    expect(hasFeature(restricted, "view_reports")).toBe(true);
  });

  it("denies a feature not in the restricted set", () => {
    expect(hasFeature(restricted, "process_payroll")).toBe(false);
  });
});

describe("inEmployeeScope / assertEmployeeInScope", () => {
  it("allows any employee when unrestricted (employeeIds: null)", () => {
    expect(inEmployeeScope(unrestricted, "any-employee")).toBe(true);
    expect(() => assertEmployeeInScope(unrestricted, "any-employee")).not.toThrow();
  });

  it("allows an employee inside the scoped set", () => {
    expect(inEmployeeScope(restricted, "emp-1")).toBe(true);
    expect(() => assertEmployeeInScope(restricted, "emp-1")).not.toThrow();
  });

  it("throws 403 for an employee outside the scoped set", () => {
    expect(inEmployeeScope(restricted, "emp-99")).toBe(false);
    expect(() => assertEmployeeInScope(restricted, "emp-99")).toThrow(
      expect.objectContaining({ status: 403 })
    );
  });
});

describe("filterToScope", () => {
  const rows = [{ employeeId: "emp-1", x: 1 }, { employeeId: "emp-2", x: 2 }, { employeeId: "emp-3", x: 3 }];

  it("returns all rows unchanged when unrestricted", () => {
    expect(filterToScope(unrestricted, rows)).toEqual(rows);
  });

  it("filters rows down to the scoped employeeIds", () => {
    const result = filterToScope(restricted, rows);
    expect(result).toEqual([{ employeeId: "emp-1", x: 1 }, { employeeId: "emp-2", x: 2 }]);
  });
});
