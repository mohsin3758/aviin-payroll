import { describe, it, expect } from "vitest";
import { normalizeClientName, nextClientCode } from "../naming";
import { canSeeAssignment, assignmentScopeWhere, isFullAccess } from "../access";

describe("normalizeClientName", () => {
  it("collapses case, punctuation and company suffixes", () => {
    const variants = ["ABC Technologies Pvt. Ltd.", "abc technologies private limited", "ABC  Technologies  PVT LTD", "Abc Technologies"];
    for (const v of variants) expect(normalizeClientName(v)).toBe("abc technologies");
  });
  it("keeps genuinely different clients apart", () => {
    expect(normalizeClientName("ABC Technologies")).not.toBe(normalizeClientName("ABC Systems"));
  });
  it("treats & as and", () => {
    expect(normalizeClientName("Tata & Sons Ltd")).toBe("tata and sons");
  });
  it("never reduces a name to nothing", () => {
    expect(normalizeClientName("Co")).toBe("co");
    expect(normalizeClientName("Pvt Ltd")).toBe("pvt ltd");
  });
});

describe("nextClientCode", () => {
  it("starts at CL-001", () => expect(nextClientCode([])).toBe("CL-001"));
  it("increments past the highest, ignoring malformed codes", () => {
    expect(nextClientCode(["CL-001", "CL-009", "junk", "CL-004"])).toBe("CL-010");
  });
  it("grows beyond three digits", () => expect(nextClientCode(["CL-999"])).toBe("CL-1000"));
});

describe("assignment access scoping", () => {
  const row = { employeeId: "emp-1", resourceCoordinatorId: "u-rc", clientCoordinatorId: "u-cc", kamId: null };
  const admin = { role: "admin" as const, userId: "u-admin", employeeId: null };
  const hr = { role: "hr" as const, userId: "u-hr", employeeId: null };
  const rc = { role: "manager" as const, userId: "u-rc", employeeId: null };
  const cc = { role: "manager" as const, userId: "u-cc", employeeId: null };
  const otherManager = { role: "manager" as const, userId: "u-other", employeeId: null };
  const self = { role: "employee" as const, userId: "u-e1", employeeId: "emp-1" };
  const otherEmployee = { role: "employee" as const, userId: "u-e2", employeeId: "emp-2" };
  const unlinkedEmployee = { role: "employee" as const, userId: "u-e3", employeeId: null };

  it("admin and hr see everything", () => {
    expect(isFullAccess("admin")).toBe(true);
    expect(isFullAccess("hr")).toBe(true);
    expect(canSeeAssignment(admin, row)).toBe(true);
    expect(canSeeAssignment(hr, row)).toBe(true);
    expect(assignmentScopeWhere(admin)).toEqual({});
  });

  it("a manager sees only assignments they coordinate", () => {
    expect(isFullAccess("manager")).toBe(false);
    expect(canSeeAssignment(rc, row)).toBe(true);
    expect(canSeeAssignment(cc, row)).toBe(true);
    expect(canSeeAssignment(otherManager, row)).toBe(false);
    expect(assignmentScopeWhere(otherManager)).toEqual({
      OR: [{ resourceCoordinatorId: "u-other" }, { clientCoordinatorId: "u-other" }, { kamId: "u-other" }],
    });
  });

  it("a KAM is also a coordinator on the assignment", () => {
    expect(canSeeAssignment({ role: "manager", userId: "u-kam", employeeId: null }, { ...row, kamId: "u-kam" })).toBe(true);
  });

  it("a contractor sees only their own assignment", () => {
    expect(canSeeAssignment(self, row)).toBe(true);
    expect(canSeeAssignment(otherEmployee, row)).toBe(false);
    expect(assignmentScopeWhere(self)).toEqual({ employeeId: "emp-1" });
  });

  it("an employee login with no linked Employee record sees nothing", () => {
    expect(canSeeAssignment(unlinkedEmployee, row)).toBe(false);
    expect(assignmentScopeWhere(unlinkedEmployee)).toBeNull();
  });

  it("a coordinator id never matches an unassigned (null) slot", () => {
    const user = { role: "manager" as const, userId: "null", employeeId: null };
    expect(canSeeAssignment(user, row)).toBe(false);
  });
});
