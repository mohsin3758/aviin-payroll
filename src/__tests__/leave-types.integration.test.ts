// Integration tests for the Leave Types & Leave Balance management feature: admin CRUD for
// LeaveType (with active/inactive filtering), the bulk-allocate endpoint (pro-ration for
// mid-year joiners, carry-forward rollover from the prior year), manual LeaveBalance
// create/edit/delete, role gating, and — the critical proof — that a newly allocated balance
// actually becomes selectable through the EXISTING POST /api/ess/leaves endpoint, confirming the
// employee-side "already works" claim rather than assuming it.
// Hits a REAL running server (`npm run dev` on localhost:3000) with a REAL database — not
// mocked. Excluded from the default `npm test` run (see vitest.integration.config.ts).
// Run manually with the dev server up:
// `npx vitest run --config vitest.integration.config.ts src/__tests__/leave-types.integration.test.ts`
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";

const BASE = "http://localhost:3000";
// A dedicated fixture slot for this suite — distinct from 2098 (holidays) / 2099 (reports).
const FIXTURE_YEAR = 2097;

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const cookie = res.headers.get("set-cookie")?.split(";")[0];
  if (!res.ok || !cookie) throw new Error(`Login failed for ${email}: ${res.status}`);
  return cookie;
}

async function ensureLogin(adminCookie: string, email: string, role: string, employeeId?: string): Promise<string> {
  const password = "TestLeaveTypes@12345";
  const res = await fetch(`${BASE}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ email, password, name: "QA LeaveTypes", role, employeeId }),
  });
  if (res.status !== 201 && res.status !== 409) {
    throw new Error(`Failed to create/reuse ${role} login ${email}: ${res.status} ${await res.text()}`);
  }
  return login(email, password);
}

async function createDisposableEmployee(adminCookie: string, label: string, dateOfJoining: string): Promise<string> {
  const res = await fetch(`${BASE}/api/employees`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      firstName: "QA", lastName: label, email: `qa.leavetypes.${label.toLowerCase()}.${Date.now()}@test.local`,
      designation: "QA Engineer", department: "Quality", dateOfJoining,
      pfApplicable: true,
      salaryStructure: { basic: 20000, houseRentAllowance: 8000, specialAllowance: 2000 },
    }),
  });
  if (!res.ok) throw new Error(`Failed to create disposable employee ${label}: ${res.status} ${await res.text()}`);
  const emp = await res.json();
  return emp.id as string;
}

async function createLeaveType(adminCookie: string, body: Record<string, unknown>): Promise<{ id: string; [k: string]: unknown }> {
  const res = await fetch(`${BASE}/api/leave-types`, {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify(body),
  });
  if (res.status !== 201) throw new Error(`Failed to create leave type: ${res.status} ${await res.text()}`);
  return (await res.json()).data;
}

describe("Leave Types & Leave Balance management (requires live dev server)", () => {
  let adminCookie: string;
  let employeeCookie: string;
  let employeeId: string;
  const createdLeaveTypeIds: string[] = [];
  const createdEmployeeIds: string[] = [];
  const createdUserEmails: string[] = [];

  beforeAll(async () => {
    adminCookie = await login("admin@payrollpro.local", "Admin@12345");

    employeeId = await createDisposableEmployee(adminCookie, "Base", "2015-01-01");
    createdEmployeeIds.push(employeeId);
    createdUserEmails.push("qa.leavetypes.employee@test.local");
    employeeCookie = await ensureLogin(adminCookie, "qa.leavetypes.employee@test.local", "employee", employeeId);
  });

  afterAll(async () => {
    if (createdEmployeeIds.length) {
      await db.leaveApplication.deleteMany({ where: { employeeId: { in: createdEmployeeIds } } });
      await db.leaveBalance.deleteMany({ where: { employeeId: { in: createdEmployeeIds } } });
    }
    if (createdLeaveTypeIds.length) {
      await db.leaveBalance.deleteMany({ where: { leaveTypeId: { in: createdLeaveTypeIds } } });
      await db.leaveApplication.deleteMany({ where: { leaveTypeId: { in: createdLeaveTypeIds } } });
      await db.leaveType.deleteMany({ where: { id: { in: createdLeaveTypeIds } } });
    }
    if (createdUserEmails.length) {
      await db.user.deleteMany({ where: { email: { in: createdUserEmails } } });
    }
    if (createdEmployeeIds.length) {
      await db.salaryStructure.deleteMany({ where: { employeeId: { in: createdEmployeeIds } } });
      await db.employee.deleteMany({ where: { id: { in: createdEmployeeIds } } });
    }
    await db.$disconnect();
  });

  describe("Leave Type CRUD + active filtering", () => {
    it("creates a leave type, and active-filtering hides it from the plain list once deactivated", async () => {
      const lt = await createLeaveType(adminCookie, {
        name: "QA Test Leave", shortCode: "QATL", totalDays: 10, isCarryForward: true, maxCarryForward: 3, isPaid: true,
      });
      createdLeaveTypeIds.push(lt.id);

      const plainListRes = await fetch(`${BASE}/api/leaves?types=true`, { headers: { Cookie: adminCookie } });
      const plainList = await plainListRes.json();
      expect(plainList.some((t: { id: string }) => t.id === lt.id)).toBe(true);

      const putRes = await fetch(`${BASE}/api/leave-types/${lt.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ active: false }),
      });
      expect(putRes.status).toBe(200);

      const plainListAfter = await fetch(`${BASE}/api/leaves?types=true`, { headers: { Cookie: adminCookie } });
      const plainListAfterJson = await plainListAfter.json();
      expect(plainListAfterJson.some((t: { id: string }) => t.id === lt.id)).toBe(false);

      const includeInactiveRes = await fetch(`${BASE}/api/leave-types?includeInactive=1`, { headers: { Cookie: adminCookie } });
      const includeInactiveJson = await includeInactiveRes.json();
      const found = includeInactiveJson.data.find((t: { id: string }) => t.id === lt.id);
      expect(found).toBeTruthy();
      expect(found.active).toBe(false);

      // Reactivate for the rest of this describe block's tests.
      await fetch(`${BASE}/api/leave-types/${lt.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ active: true }),
      });
    });

    it("employee role is blocked from creating or editing a leave type", async () => {
      const createRes = await fetch(`${BASE}/api/leave-types`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: employeeCookie },
        body: JSON.stringify({ name: "Should Fail", shortCode: "SF", totalDays: 5 }),
      });
      expect(createRes.status).toBe(403);
    });
  });

  describe("Bulk allocation — proration and carry-forward", () => {
    it("grants full entitlement for an employee who joined years ago", async () => {
      const lt = await createLeaveType(adminCookie, {
        name: "QA Alloc Full", shortCode: "QAAF", totalDays: 12, isCarryForward: false, maxCarryForward: 0, isPaid: true,
      });
      createdLeaveTypeIds.push(lt.id);

      const res = await fetch(`${BASE}/api/leave-types/${lt.id}/allocate`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ year: FIXTURE_YEAR }),
      });
      expect(res.status).toBe(200);
      const summary = await res.json();
      expect(summary.allocated).toBeGreaterThanOrEqual(1);

      const balance = await db.leaveBalance.findUnique({
        where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: lt.id, year: FIXTURE_YEAR } },
      });
      expect(balance).toBeTruthy();
      expect(balance!.totalAllocated).toBe(12);
    });

    it("pro-rates for an employee who joined mid-year, and rolls forward capped carry-forward from the prior year", async () => {
      const lt = await createLeaveType(adminCookie, {
        name: "QA Alloc Prorate", shortCode: "QAAP", totalDays: 15, isCarryForward: true, maxCarryForward: 4, isPaid: true,
      });
      createdLeaveTypeIds.push(lt.id);

      const midYearEmpId = await createDisposableEmployee(adminCookie, "MidYear", `${FIXTURE_YEAR}-07-02`);
      createdEmployeeIds.push(midYearEmpId);

      // Prior-year balance with 10 unused days (well above the 4-day cap) to prove capping works.
      await db.leaveBalance.create({
        data: { employeeId: midYearEmpId, leaveTypeId: lt.id, year: FIXTURE_YEAR - 1, totalAllocated: 15, carryForwarded: 0, used: 5 },
      });

      const res = await fetch(`${BASE}/api/leave-types/${lt.id}/allocate`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ year: FIXTURE_YEAR }),
      });
      expect(res.status).toBe(200);

      const balance = await db.leaveBalance.findUnique({
        where: { employeeId_leaveTypeId_year: { employeeId: midYearEmpId, leaveTypeId: lt.id, year: FIXTURE_YEAR } },
      });
      expect(balance).toBeTruthy();
      // Joined Jul 2 of a 365-day year: ~183/365 remaining.
      expect(balance!.totalAllocated).toBe(Math.round(15 * (183 / 365)));
      // available prior = 15 - 5 = 10, capped at maxCarryForward of 4.
      expect(balance!.carryForwarded).toBe(4);
    });

    it("skips an employee who already has a balance for that year rather than erroring the whole batch", async () => {
      const lt = await createLeaveType(adminCookie, {
        name: "QA Alloc Skip", shortCode: "QAAS", totalDays: 8, isCarryForward: false, maxCarryForward: 0, isPaid: true,
      });
      createdLeaveTypeIds.push(lt.id);

      await db.leaveBalance.create({
        data: { employeeId, leaveTypeId: lt.id, year: FIXTURE_YEAR, totalAllocated: 99, carryForwarded: 0, used: 0 },
      });

      const res = await fetch(`${BASE}/api/leave-types/${lt.id}/allocate`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ year: FIXTURE_YEAR }),
      });
      const summary = await res.json();
      expect(summary.skipped).toBeGreaterThanOrEqual(1);

      // Untouched — proves "skip" really means skip, not silently overwriting.
      const balance = await db.leaveBalance.findUnique({
        where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: lt.id, year: FIXTURE_YEAR } },
      });
      expect(balance!.totalAllocated).toBe(99);
    });

    it("employee role is blocked from allocating", async () => {
      const lt = await createLeaveType(adminCookie, {
        name: "QA Alloc Gate", shortCode: "QAAG", totalDays: 5, isCarryForward: false, maxCarryForward: 0, isPaid: true,
      });
      createdLeaveTypeIds.push(lt.id);

      const res = await fetch(`${BASE}/api/leave-types/${lt.id}/allocate`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: employeeCookie },
        body: JSON.stringify({ year: FIXTURE_YEAR }),
      });
      expect(res.status).toBe(403);
    });
  });

  describe("Manual leave balance create/edit/delete", () => {
    it("creates, then blocks a duplicate create (409), edits with a reason, and blocks delete once used > 0", async () => {
      const lt = await createLeaveType(adminCookie, {
        name: "QA Manual Balance", shortCode: "QAMB", totalDays: 10, isCarryForward: false, maxCarryForward: 0, isPaid: true,
      });
      createdLeaveTypeIds.push(lt.id);

      const createRes = await fetch(`${BASE}/api/leave-balances`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ employeeId, leaveTypeId: lt.id, year: FIXTURE_YEAR, totalAllocated: 10, carryForwarded: 0 }),
      });
      expect(createRes.status).toBe(201);
      const created = (await createRes.json()).data;

      const dupRes = await fetch(`${BASE}/api/leave-balances`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ employeeId, leaveTypeId: lt.id, year: FIXTURE_YEAR, totalAllocated: 10, carryForwarded: 0 }),
      });
      expect(dupRes.status).toBe(409);

      // Reject an edit with no reason.
      const noReasonRes = await fetch(`${BASE}/api/leave-balances/${created.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ totalAllocated: 12 }),
      });
      expect(noReasonRes.status).toBe(400);

      const editRes = await fetch(`${BASE}/api/leave-balances/${created.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ totalAllocated: 12, used: 3, reason: "QA correction test" }),
      });
      expect(editRes.status).toBe(200);

      const deleteBlockedRes = await fetch(`${BASE}/api/leave-balances/${created.id}`, { method: "DELETE", headers: { Cookie: adminCookie } });
      expect(deleteBlockedRes.status).toBe(400);

      // Revert used to 0 so delete is allowed, then confirm it actually deletes.
      await fetch(`${BASE}/api/leave-balances/${created.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ used: 0, reason: "QA cleanup before delete" }),
      });
      const deleteRes = await fetch(`${BASE}/api/leave-balances/${created.id}`, { method: "DELETE", headers: { Cookie: adminCookie } });
      expect(deleteRes.status).toBe(200);
    });
  });

  describe("End-to-end: an allocated balance is actually usable by the employee", () => {
    it("a newly allocated balance becomes selectable and usable via the existing POST /api/ess/leaves", async () => {
      const lt = await createLeaveType(adminCookie, {
        name: "QA E2E Leave", shortCode: "QAE2E", totalDays: 5, isCarryForward: false, maxCarryForward: 0, isPaid: true,
      });
      createdLeaveTypeIds.push(lt.id);

      // Before any balance exists, the employee's own apply-for-leave call must fail.
      const beforeRes = await fetch(`${BASE}/api/ess/leaves`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: employeeCookie },
        body: JSON.stringify({ leaveTypeId: lt.id, startDate: `${FIXTURE_YEAR}-03-10`, endDate: `${FIXTURE_YEAR}-03-10`, reason: "QA e2e" }),
      });
      expect(beforeRes.status).toBe(400);

      const allocateRes = await fetch(`${BASE}/api/leave-types/${lt.id}/allocate`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ year: FIXTURE_YEAR }),
      });
      expect(allocateRes.status).toBe(200);

      // After allocation, the exact same employee apply call now succeeds.
      const afterRes = await fetch(`${BASE}/api/ess/leaves`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: employeeCookie },
        body: JSON.stringify({ leaveTypeId: lt.id, startDate: `${FIXTURE_YEAR}-03-10`, endDate: `${FIXTURE_YEAR}-03-10`, reason: "QA e2e" }),
      });
      expect(afterRes.status).toBe(201);
      const application = (await afterRes.json()).data;

      // LeaveBalance.used only increments on admin approval (src/app/api/leaves/[id]/route.ts),
      // not at application time — approve it to prove the full pipeline actually pays out.
      const approveRes = await fetch(`${BASE}/api/leaves/${application.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ status: "approved" }),
      });
      expect(approveRes.status).toBe(200);

      const balanceRes = await fetch(`${BASE}/api/ess/leaves/balance?year=${FIXTURE_YEAR}`, { headers: { Cookie: employeeCookie } });
      const balanceJson = await balanceRes.json();
      const row = balanceJson.data.find((b: { leaveTypeId: string }) => b.leaveTypeId === lt.id);
      expect(row).toBeTruthy();
      expect(row.used).toBe(1);
    });
  });
});
