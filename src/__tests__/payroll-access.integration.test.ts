// Integration tests for configurable per-hr-user payroll feature + employee-scope restrictions
// (src/lib/payroll-access.ts). These hit a REAL running server (`npm run dev` on localhost:3000)
// with a REAL database — not mocked. Excluded from the default `npm test` run (see
// vitest.integration.config.ts) since they require a live server + seeded DB.
// Run manually with the dev server up:
// npx vitest run --config vitest.integration.config.ts src/__tests__/payroll-access.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";

const BASE = "http://localhost:3000";
// A dedicated fixture slot for this suite's disposable payroll runs/arrears/loans, distinct from
// the year ranges other integration suites use (regression: 2100+, reports: 2099).
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

async function ensureLogin(adminCookie: string, email: string, role: string, employeeId?: string): Promise<{ cookie: string; id: string }> {
  const password = "TestPayrollAccess@12345";
  const res = await fetch(`${BASE}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ email, password, name: "QA Payroll Access", role, employeeId }),
  });
  if (res.status !== 201 && res.status !== 409) {
    throw new Error(`Failed to create/reuse ${role} login ${email}: ${res.status} ${await res.text()}`);
  }
  const cookie = await login(email, password);
  const meRes = await fetch(`${BASE}/api/users`, { headers: { Cookie: adminCookie } });
  const { data } = await meRes.json();
  const me = data.find((u: { email: string }) => u.email === email);
  return { cookie, id: me.id };
}

async function resolveEmployeeId(adminCookie: string, employeeCode: string): Promise<string> {
  const res = await fetch(`${BASE}/api/employees?search=${employeeCode}`, { headers: { Cookie: adminCookie } });
  const { data } = await res.json();
  const emp = data.find((e: { employeeCode: string }) => e.employeeCode === employeeCode) ?? data[0];
  if (!emp) throw new Error(`Seeded employee ${employeeCode} not found — is the DB seeded?`);
  return emp.id;
}

async function setPayrollAccess(adminCookie: string, userId: string, features: string[], employeeIds: string[]) {
  const res = await fetch(`${BASE}/api/users/${userId}/payroll-access`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ features, employeeIds }),
  });
  if (!res.ok) throw new Error(`Failed to set payroll access: ${res.status} ${await res.text()}`);
}

describe("Payroll access restrictions (requires live dev server)", () => {
  let adminCookie: string;
  let hrCookie: string;
  let hrId: string;
  let managerCookie: string;
  let selfId: string; // EMP001 — the "in-scope" employee for scoped tests
  let otherId: string; // EMP002 — the "out-of-scope" employee for scoped tests
  const createdArrearIds: string[] = [];
  const createdEmployeeIds: string[] = [];
  const createdExitRequestIds: string[] = [];

  beforeAll(async () => {
    adminCookie = await login("admin@payrollpro.local", "Admin@12345");
    const hr = await ensureLogin(adminCookie, "qa.payrollaccess.hr@test.local", "hr");
    hrCookie = hr.cookie;
    hrId = hr.id;
    managerCookie = await login("manager@payrollpro.local", "Manager@12345");
    selfId = await resolveEmployeeId(adminCookie, "EMP001");
    otherId = await resolveEmployeeId(adminCookie, "EMP002");
  });

  afterAll(async () => {
    // Leave this hr user fully unrestricted so it doesn't affect any later run of this suite.
    await setPayrollAccess(adminCookie, hrId, [], []);
    if (createdArrearIds.length) {
      await db.salaryArrear.deleteMany({ where: { id: { in: createdArrearIds } } });
    }
    if (createdExitRequestIds.length) {
      await db.exitChecklistItem.deleteMany({ where: { exitRequestId: { in: createdExitRequestIds } } });
      await db.exitRequest.deleteMany({ where: { id: { in: createdExitRequestIds } } });
    }
    if (createdEmployeeIds.length) {
      await db.salaryStructure.deleteMany({ where: { employeeId: { in: createdEmployeeIds } } });
      await db.employee.deleteMany({ where: { id: { in: createdEmployeeIds } } });
    }
  });

  it("unrestricted hr user is unaffected across every gated route (regression guard)", async () => {
    await setPayrollAccess(adminCookie, hrId, [], []);

    const arrears = await fetch(`${BASE}/api/arrears`, { headers: { Cookie: hrCookie } });
    expect(arrears.status).toBe(200);

    const loans = await fetch(`${BASE}/api/loans`, { headers: { Cookie: hrCookie } });
    expect(loans.status).toBe(200);

    const salarySlip = await fetch(`${BASE}/api/salary-slip?employeeId=${otherId}&month=1&year=${FIXTURE_YEAR}`, { headers: { Cookie: hrCookie } });
    expect(salarySlip.status).not.toBe(403);

    const reports = await fetch(`${BASE}/api/reports?type=headcount`, { headers: { Cookie: hrCookie } });
    expect(reports.status).toBe(200);

    const payroll = await fetch(`${BASE}/api/payroll?month=1&year=${FIXTURE_YEAR}`, { headers: { Cookie: hrCookie } });
    expect(payroll.status).toBe(200);
  });

  it("feature-restricted (view_reports only) hr user is 403'd on other payroll routes, allowed on reports", async () => {
    await setPayrollAccess(adminCookie, hrId, ["view_reports"], []);

    const reports = await fetch(`${BASE}/api/reports?type=headcount`, { headers: { Cookie: hrCookie } });
    expect(reports.status).toBe(200);

    const arrears = await fetch(`${BASE}/api/arrears`, { headers: { Cookie: hrCookie } });
    expect(arrears.status).toBe(403);

    const loansPost = await fetch(`${BASE}/api/loans`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: hrCookie },
      body: JSON.stringify({ employeeId: selfId, loanType: "advance", principal: 1000, emiAmount: 100, totalMonths: 10, startMonth: 1, startYear: FIXTURE_YEAR }),
    });
    expect(loansPost.status).toBe(403);

    const payroll = await fetch(`${BASE}/api/payroll?month=1&year=${FIXTURE_YEAR}`, { headers: { Cookie: hrCookie } });
    expect(payroll.status).toBe(403);
  });

  it("employee-scoped hr user (manage_arrears + view_payroll, scoped to selfId) is blocked for otherId, allowed for selfId, and lists come back filtered", async () => {
    await setPayrollAccess(adminCookie, hrId, ["manage_arrears", "view_payroll"], [selfId]);

    // Seed one arrear per employee as admin (unrestricted), so there's something real to filter.
    const forSelf = await fetch(`${BASE}/api/arrears`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ employeeId: selfId, amount: 500, payMonth: 2, payYear: FIXTURE_YEAR }),
    });
    const forOther = await fetch(`${BASE}/api/arrears`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ employeeId: otherId, amount: 500, payMonth: 2, payYear: FIXTURE_YEAR }),
    });
    expect(forSelf.status).toBe(201);
    expect(forOther.status).toBe(201);
    createdArrearIds.push((await forSelf.json()).id, (await forOther.json()).id);

    const scopedSelf = await fetch(`${BASE}/api/arrears?employeeId=${selfId}`, { headers: { Cookie: hrCookie } });
    expect(scopedSelf.status).toBe(200);

    const scopedOther = await fetch(`${BASE}/api/arrears?employeeId=${otherId}`, { headers: { Cookie: hrCookie } });
    expect(scopedOther.status).toBe(403);

    const listRes = await fetch(`${BASE}/api/arrears`, { headers: { Cookie: hrCookie } });
    expect(listRes.status).toBe(200);
    const { data } = await listRes.json();
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((a: { employeeId: string }) => a.employeeId === selfId)).toBe(true);
  });

  it("off-cycle payroll rejects an entry naming an out-of-scope employee", async () => {
    await setPayrollAccess(adminCookie, hrId, ["process_payroll"], [selfId]);

    const res = await fetch(`${BASE}/api/payroll/off-cycle`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: hrCookie },
      body: JSON.stringify({
        month: 3, year: FIXTURE_YEAR, reason: "QA off-cycle scope test",
        entries: [{ employeeId: selfId, amount: 1000 }, { employeeId: otherId, amount: 1000 }],
      }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain(otherId);
  });

  it("send-bulk salary slips skips out-of-scope employees instead of sending to them", async () => {
    await setPayrollAccess(adminCookie, hrId, ["send_payslips"], [selfId]);

    // Process a real regular run as admin (unrestricted) so send-bulk has real details to work with.
    const processRes = await fetch(`${BASE}/api/payroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ month: 4, year: FIXTURE_YEAR }),
    });
    expect([200, 409]).toContain(processRes.status);

    const runsRes = await fetch(`${BASE}/api/payroll?month=4&year=${FIXTURE_YEAR}`, { headers: { Cookie: adminCookie } });
    const runs = await runsRes.json();
    const runId = runs[0]?.id;
    expect(runId).toBeTruthy();

    const sendRes = await fetch(`${BASE}/api/salary-slip/send-bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: hrCookie },
      body: JSON.stringify({ payrollRunId: runId }),
    });
    expect(sendRes.status).toBe(200);
    const summary = await sendRes.json();
    const otherRow = summary.results.find((r: { employeeId: string }) => r.employeeId === otherId);
    expect(otherRow?.status).toBe("skipped");
    expect(otherRow?.error).toContain("scope");
  });

  it("admin stays fully unrestricted even if UserPayrollFeature/UserPayrollEmployeeScope rows exist for their id (defense in depth)", async () => {
    const meRes = await fetch(`${BASE}/api/auth/session`, { headers: { Cookie: adminCookie } });
    const { user: adminUser } = await meRes.json();

    // Bypass the write-side (role==hr-only) guard entirely by inserting directly, proving the
    // READ-side role check in getPayrollRestriction is what protects the ceiling, not just PUT.
    await db.userPayrollFeature.create({ data: { userId: adminUser.id, feature: "view_reports" } });
    try {
      const arrears = await fetch(`${BASE}/api/arrears`, { headers: { Cookie: adminCookie } });
      expect(arrears.status).toBe(200);
      const payroll = await fetch(`${BASE}/api/payroll?month=1&year=${FIXTURE_YEAR}`, { headers: { Cookie: adminCookie } });
      expect(payroll.status).toBe(200);
    } finally {
      await db.userPayrollFeature.deleteMany({ where: { userId: adminUser.id } });
    }
  });

  it("PUT /api/users/[id]/payroll-access rejects targeting a non-hr user", async () => {
    const managerRes = await fetch(`${BASE}/api/users`, { headers: { Cookie: adminCookie } });
    const { data } = await managerRes.json();
    const manager = data.find((u: { role: string }) => u.role === "manager");
    expect(manager).toBeTruthy();

    const res = await fetch(`${BASE}/api/users/${manager.id}/payroll-access`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ features: ["view_reports"], employeeIds: [] }),
    });
    expect(res.status).toBe(400);
  });

  it("feature-restricted hr user (manage_leave_management only) can manage leave types but is 403'd on arrears", async () => {
    await setPayrollAccess(adminCookie, hrId, ["manage_leave_management"], []);

    const createType = await fetch(`${BASE}/api/leave-types`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: hrCookie },
      body: JSON.stringify({ name: `QA Leave Type ${Date.now()}`, shortCode: "QAL", totalDays: 5, isCarryForward: false, maxCarryForward: 0, isPaid: true }),
    });
    expect(createType.status).toBe(201);
    const created = await createType.json();
    await db.leaveType.delete({ where: { id: created.data.id } });

    const arrears = await fetch(`${BASE}/api/arrears`, { headers: { Cookie: hrCookie } });
    expect(arrears.status).toBe(403);
  });

  it("employee-scoped hr user (edit_employee, scoped to selfId) can edit selfId but is 403'd on otherId, and the employees list comes back filtered", async () => {
    await setPayrollAccess(adminCookie, hrId, ["edit_employee", "view_employees"], [selfId]);

    const editSelf = await fetch(`${BASE}/api/employees/${selfId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: hrCookie },
      body: JSON.stringify({}),
    });
    expect(editSelf.status).not.toBe(403);

    const editOther = await fetch(`${BASE}/api/employees/${otherId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: hrCookie },
      body: JSON.stringify({}),
    });
    expect(editOther.status).toBe(403);

    const list = await fetch(`${BASE}/api/employees?limit=200`, { headers: { Cookie: hrCookie } });
    expect(list.status).toBe(200);
    const { data } = await list.json();
    expect(data.length).toBeGreaterThan(0);
    expect(data.every((e: { id: string }) => e.id === selfId)).toBe(true);
  });

  it("create_employee is exempt from employee-scoping — a scoped hr user can still create a brand-new employee", async () => {
    await setPayrollAccess(adminCookie, hrId, ["create_employee"], [selfId]);

    const res = await fetch(`${BASE}/api/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: hrCookie },
      body: JSON.stringify({
        firstName: "QA", lastName: "ScopeExempt", email: `qa.scope.exempt.${Date.now()}@test.local`,
        dateOfJoining: new Date().toISOString(), designation: "QA Tester", department: "QA",
      }),
    });
    expect(res.status).toBe(201);
    const created = await res.json();
    createdEmployeeIds.push(created.id);
  });

  it("exit management: hr user without manage_exit_management is 403'd on hr-approve, but manager's manager-approve on the same request is unaffected", async () => {
    const empRes = await fetch(`${BASE}/api/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        firstName: "QA", lastName: "ExitFlow", email: `qa.exit.flow.${Date.now()}@test.local`,
        dateOfJoining: new Date().toISOString(), designation: "QA Tester", department: "QA",
      }),
    });
    expect(empRes.status).toBe(201);
    const employee = await empRes.json();
    createdEmployeeIds.push(employee.id);

    const exitRes = await fetch(`${BASE}/api/exit-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ employeeId: employee.id, resignationDate: new Date().toISOString() }),
    });
    expect(exitRes.status).toBe(201);
    const { data: exitRequest } = await exitRes.json();
    createdExitRequestIds.push(exitRequest.id);

    await setPayrollAccess(adminCookie, hrId, ["view_reports"], []); // no manage_exit_management
    const hrApprove = await fetch(`${BASE}/api/exit-requests/${exitRequest.id}/hr-approve`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: hrCookie },
      body: JSON.stringify({ approved: true }),
    });
    expect(hrApprove.status).toBe(403);

    const managerApprove = await fetch(`${BASE}/api/exit-requests/${exitRequest.id}/manager-approve`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: managerCookie },
      body: JSON.stringify({ approved: true }),
    });
    expect(managerApprove.status).not.toBe(403);
  });
});
