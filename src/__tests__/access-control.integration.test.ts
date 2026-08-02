// Integration tests for the access-control fixes (role/ownership scoping across Reports,
// Employees, Leaves, Salary Slip, Form16, Attendance, Payroll), plus the new geofence and
// login-based-attendance features. These hit a REAL running server (`npm run dev` on
// localhost:3000) with a REAL database — not mocked. Excluded from the default `npm test` run
// (see vitest.integration.config.ts) since they require a live server + seeded DB.
// Run manually with the dev server up: `npx vitest run --config vitest.integration.config.ts src/__tests__/access-control.integration.test.ts`
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const BASE = "http://localhost:3000";

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

async function resolveEmployeeId(adminCookie: string, employeeCode: string): Promise<string> {
  const res = await fetch(`${BASE}/api/employees?search=${employeeCode}`, { headers: { Cookie: adminCookie } });
  const { data } = await res.json();
  const emp = data.find((e: { employeeCode: string }) => e.employeeCode === employeeCode) ?? data[0];
  if (!emp) throw new Error(`Seeded employee ${employeeCode} not found — is the DB seeded?`);
  return emp.id;
}

/** Creates (or reuses, on a re-run) a fixed-password employee-role login linked to employeeId. */
async function ensureEmployeeLogin(adminCookie: string, email: string, employeeId: string): Promise<string> {
  const password = "TestEmp@12345";
  const createRes = await fetch(`${BASE}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ email, password, name: "QA Test Employee", role: "employee", employeeId }),
  });
  if (createRes.status !== 201 && createRes.status !== 409) {
    throw new Error(`Failed to create/reuse test employee login ${email}: ${createRes.status} ${await createRes.text()}`);
  }
  return login(email, password);
}

describe("Access control fixes (requires live dev server)", () => {
  let adminCookie: string;
  let managerCookie: string;
  let employeeCookie: string; // linked to EMP001 ("self")
  let selfId: string; // EMP001
  let otherId: string; // EMP002 ("someone else")

  beforeAll(async () => {
    adminCookie = await login("admin@payrollpro.local", "Admin@12345");
    managerCookie = await login("manager@payrollpro.local", "Manager@12345");
    selfId = await resolveEmployeeId(adminCookie, "EMP001");
    otherId = await resolveEmployeeId(adminCookie, "EMP002");
    employeeCookie = await ensureEmployeeLogin(adminCookie, "qa.employee1@test.local", selfId);
  });

  // ---- Employees directory ----
  it("employees directory: employee role sees only themselves, no salary figures gated off", async () => {
    const res = await fetch(`${BASE}/api/employees`, { headers: { Cookie: employeeCookie } });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.length).toBe(1);
    expect(data[0].id).toBe(selfId);
    expect("salaryStructure" in data[0]).toBe(true);
  });

  it("employees directory: manager sees everyone but never salaryStructure", async () => {
    const res = await fetch(`${BASE}/api/employees`, { headers: { Cookie: managerCookie } });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.length).toBeGreaterThan(1);
    expect(data.every((e: Record<string, unknown>) => !("salaryStructure" in e))).toBe(true);
  });

  it("employees directory: admin sees everyone including salaryStructure", async () => {
    const res = await fetch(`${BASE}/api/employees`, { headers: { Cookie: adminCookie } });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.length).toBeGreaterThan(1);
    expect(data.some((e: Record<string, unknown>) => "salaryStructure" in e)).toBe(true);
  });

  // ---- Leaves (list/apply/delete) ----
  it("leaves list: employee's employeeId filter is silently forced to their own, not the requested one", async () => {
    const res = await fetch(`${BASE}/api/leaves?employeeId=${otherId}`, { headers: { Cookie: employeeCookie } });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    for (const app of data) expect(app.employeeId).toBe(selfId);
  });

  it("leaves apply: employee's submitted employeeId is ignored in favor of their own", async () => {
    const balRes = await fetch(`${BASE}/api/leaves/balance?employeeId=${selfId}`, { headers: { Cookie: employeeCookie } });
    expect(balRes.status).toBe(200);
    const balances = await balRes.json();
    expect(balances.length).toBeGreaterThan(0);
    const leaveTypeId = balances[0].leaveTypeId;

    const createRes = await fetch(`${BASE}/api/leaves`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: employeeCookie },
      body: JSON.stringify({ employeeId: otherId, leaveTypeId, startDate: "2026-09-05", endDate: "2026-09-05", reason: "access-control test" }),
    });
    expect(createRes.status).toBe(201);
    const leave = await createRes.json();
    expect(leave.employeeId).toBe(selfId);
    expect(leave.employeeId).not.toBe(otherId);

    // Cleanup so repeated runs don't exhaust the balance.
    await fetch(`${BASE}/api/leaves/${leave.id}`, { method: "DELETE", headers: { Cookie: employeeCookie } });
  });

  it("leaves balance: employee can read their own but not someone else's", async () => {
    const own = await fetch(`${BASE}/api/leaves/balance?employeeId=${selfId}`, { headers: { Cookie: employeeCookie } });
    expect(own.status).toBe(200);
    const other = await fetch(`${BASE}/api/leaves/balance?employeeId=${otherId}`, { headers: { Cookie: employeeCookie } });
    expect(other.status).toBe(403);
  });

  it("leaves delete: employee cannot cancel someone else's application, only their own", async () => {
    const balRes = await fetch(`${BASE}/api/leaves/balance?employeeId=${otherId}`, { headers: { Cookie: adminCookie } });
    const balances = await balRes.json();
    const leaveTypeId = balances[0].leaveTypeId;
    const createRes = await fetch(`${BASE}/api/leaves`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ employeeId: otherId, leaveTypeId, startDate: "2026-09-06", endDate: "2026-09-06", reason: "access-control test (other)" }),
    });
    const othersLeave = await createRes.json();

    const forbidden = await fetch(`${BASE}/api/leaves/${othersLeave.id}`, { method: "DELETE", headers: { Cookie: employeeCookie } });
    expect(forbidden.status).toBe(403);

    // Cleanup as admin (who is always allowed).
    const cleanup = await fetch(`${BASE}/api/leaves/${othersLeave.id}`, { method: "DELETE", headers: { Cookie: adminCookie } });
    expect(cleanup.status).toBe(200);
  });

  // ---- Salary Slip / Form16 (self or admin/hr only — never manager) ----
  it("salary slip: blocks employee-on-other and manager entirely; never blocks self or admin", async () => {
    const asOther = await fetch(`${BASE}/api/salary-slip?employeeId=${otherId}&month=1&year=2025`, { headers: { Cookie: employeeCookie } });
    expect(asOther.status).toBe(403);
    const asManager = await fetch(`${BASE}/api/salary-slip?employeeId=${selfId}&month=1&year=2025`, { headers: { Cookie: managerCookie } });
    expect(asManager.status).toBe(403);
    const asSelf = await fetch(`${BASE}/api/salary-slip?employeeId=${selfId}&month=1&year=2025`, { headers: { Cookie: employeeCookie } });
    expect(asSelf.status).not.toBe(403);
    const asAdmin = await fetch(`${BASE}/api/salary-slip?employeeId=${selfId}&month=1&year=2025`, { headers: { Cookie: adminCookie } });
    expect(asAdmin.status).not.toBe(403);
  });

  it("form16: blocks employee-on-other and manager entirely; never blocks self or admin", async () => {
    const asOther = await fetch(`${BASE}/api/form16?employeeId=${otherId}&fyStartYear=2025`, { headers: { Cookie: employeeCookie } });
    expect(asOther.status).toBe(403);
    const asManager = await fetch(`${BASE}/api/form16?employeeId=${selfId}&fyStartYear=2025`, { headers: { Cookie: managerCookie } });
    expect(asManager.status).toBe(403);
    const asSelf = await fetch(`${BASE}/api/form16?employeeId=${selfId}&fyStartYear=2025`, { headers: { Cookie: employeeCookie } });
    expect(asSelf.status).not.toBe(403);
    const asAdmin = await fetch(`${BASE}/api/form16?employeeId=${selfId}&fyStartYear=2025`, { headers: { Cookie: adminCookie } });
    expect(asAdmin.status).not.toBe(403);
  });

  // ---- Attendance (list + punch) ----
  it("attendance list: employee's employeeId filter is silently forced to their own", async () => {
    const res = await fetch(`${BASE}/api/attendance?employeeId=${otherId}`, { headers: { Cookie: employeeCookie } });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    for (const rec of data) expect(rec.employeeId).toBe(selfId);
  });

  it("punch: employee cannot punch on behalf of someone else, but can punch for themselves", async () => {
    const forOther = await fetch(`${BASE}/api/attendance/punch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: employeeCookie },
      body: JSON.stringify({ employeeId: otherId, action: "in", method: "manual" }),
    });
    expect(forOther.status).toBe(403);

    const forSelf = await fetch(`${BASE}/api/attendance/punch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: employeeCookie },
      body: JSON.stringify({ employeeId: selfId, action: "in", method: "manual" }),
    });
    expect([201, 409]).toContain(forSelf.status);
  });

  it("punch: admin/hr/manager can still punch on behalf of another employee (regression guard)", async () => {
    const res = await fetch(`${BASE}/api/attendance/punch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ employeeId: otherId, action: "in", method: "manual" }),
    });
    expect([201, 409]).toContain(res.status);
  });

  // ---- Reports / Payroll ----
  it("reports: employee blocked, manager and admin allowed", async () => {
    // Reports needs an actual regular payroll run to summarize. Unlike regression.integration
    // .test.ts's "hunt for a free year" strategy, GET /api/reports rejects year > 2100 outright
    // (a sane real-world bound) — so this uses one fixed, idempotent fixture slot (month 11 of
    // 2100, distinct from month 10 used by that other suite) instead of ever incrementing.
    const reportYear = 2100;
    const existingRun = await fetch(`${BASE}/api/payroll?month=11&year=${reportYear}`, { headers: { Cookie: adminCookie } });
    const runs = await existingRun.json();
    if (Array.isArray(runs) && runs.length === 0) {
      const createRun = await fetch(`${BASE}/api/payroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ month: 11, year: reportYear }),
      });
      expect([200, 409]).toContain(createRun.status);
    }

    const asEmployee = await fetch(`${BASE}/api/reports?month=11&year=${reportYear}&type=summary`, { headers: { Cookie: employeeCookie } });
    expect(asEmployee.status).toBe(403);
    const asManager = await fetch(`${BASE}/api/reports?month=11&year=${reportYear}&type=summary`, { headers: { Cookie: managerCookie } });
    expect(asManager.status).toBe(200);
    const asAdmin = await fetch(`${BASE}/api/reports?month=11&year=${reportYear}&type=summary`, { headers: { Cookie: adminCookie } });
    expect(asAdmin.status).toBe(200);
  });

  it("payroll list: employee and manager both blocked, admin allowed", async () => {
    const asEmployee = await fetch(`${BASE}/api/payroll`, { headers: { Cookie: employeeCookie } });
    expect(asEmployee.status).toBe(403);
    const asManager = await fetch(`${BASE}/api/payroll`, { headers: { Cookie: managerCookie } });
    expect(asManager.status).toBe(403);
    const asAdmin = await fetch(`${BASE}/api/payroll`, { headers: { Cookie: adminCookie } });
    expect(asAdmin.status).toBe(200);
  });

  // ---- Exit Management: manager approval end-to-end (the nav-gap fix, gap 7) ----
  it("exit management: a manager can complete stage-1 approval (backend already supported this; nav was the only blocker)", async () => {
    const employeeForExit = await resolveEmployeeId(adminCookie, "EMP003");

    async function freshPendingManagerRequest(): Promise<{ id: string; status: string }> {
      const createRes = await fetch(`${BASE}/api/exit-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ employeeId: employeeForExit, resignationDate: "2026-08-01", reason: "access-control test" }),
      });
      if (createRes.status === 201) return createRes.json().then((r) => r.data);

      // 409: a request from a prior run is still in progress — drive it to a terminal state
      // (rejected) so this run gets a clean pending_manager request to actually test against.
      const listRes = await fetch(`${BASE}/api/exit-requests`, { headers: { Cookie: adminCookie } });
      const { data: existing } = await listRes.json();
      const prior = existing.find((r: { employeeId: string }) => r.employeeId === employeeForExit);
      if (prior.status === "pending_manager") {
        await fetch(`${BASE}/api/exit-requests/${prior.id}/manager-approve`, {
          method: "PUT", headers: { "Content-Type": "application/json", Cookie: managerCookie }, body: JSON.stringify({ approved: false }),
        });
      } else if (prior.status === "pending_hr") {
        await fetch(`${BASE}/api/exit-requests/${prior.id}/hr-approve`, {
          method: "PUT", headers: { "Content-Type": "application/json", Cookie: adminCookie }, body: JSON.stringify({ approved: false }),
        });
      }
      const retryRes = await fetch(`${BASE}/api/exit-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ employeeId: employeeForExit, resignationDate: "2026-08-01", reason: "access-control test" }),
      });
      expect(retryRes.status).toBe(201);
      return retryRes.json().then((r) => r.data);
    }

    const exitRequest = await freshPendingManagerRequest();
    expect(exitRequest.status).toBe("pending_manager");

    const approveRes = await fetch(`${BASE}/api/exit-requests/${exitRequest.id}/manager-approve`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: managerCookie },
      body: JSON.stringify({ approved: true, comment: "Approved via access-control test" }),
    });
    expect(approveRes.status).toBe(200);
    const approved = await approveRes.json();
    expect(approved.data.status).toBe("pending_hr");

    // Cleanup: terminate at rejected so future runs get a clean slate.
    await fetch(`${BASE}/api/exit-requests/${exitRequest.id}/hr-approve`, {
      method: "PUT", headers: { "Content-Type": "application/json", Cookie: adminCookie }, body: JSON.stringify({ approved: false }),
    });
  });

  // ---- Second-pass findings: 10 more routes with the identical unscoped-employeeId /
  // missing-auth pattern, found by an audit of every remaining route after the first 9 fixes.
  describe("second-pass access-control fixes", () => {
    it("salary-slip send: was completely unauthenticated — now blocks employee/manager, allows admin", async () => {
      const asEmployee = await fetch(`${BASE}/api/salary-slip/send`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: employeeCookie },
        body: JSON.stringify({ employeeId: selfId, month: 1, year: 2025 }),
      });
      expect(asEmployee.status).toBe(403);
      const asManager = await fetch(`${BASE}/api/salary-slip/send`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: managerCookie },
        body: JSON.stringify({ employeeId: selfId, month: 1, year: 2025 }),
      });
      expect(asManager.status).toBe(403);
      const asAdmin = await fetch(`${BASE}/api/salary-slip/send`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ employeeId: selfId, month: 1, year: 2025 }),
      });
      expect(asAdmin.status).not.toBe(403); // whatever the data-availability outcome, auth passed
    });

    it("payroll run detail: blocks employee/manager, allows admin (full bank/PAN/Aadhaar for every employee in the run)", async () => {
      const reportYear = 2100; // same fixture slot as the reports test
      const runList = await fetch(`${BASE}/api/payroll?month=11&year=${reportYear}`, { headers: { Cookie: adminCookie } });
      const runs = await runList.json();
      const runId = runs[0]?.id;
      expect(runId).toBeTruthy();

      const asEmployee = await fetch(`${BASE}/api/payroll/${runId}`, { headers: { Cookie: employeeCookie } });
      expect(asEmployee.status).toBe(403);
      const asManager = await fetch(`${BASE}/api/payroll/${runId}`, { headers: { Cookie: managerCookie } });
      expect(asManager.status).toBe(403);
      const asAdmin = await fetch(`${BASE}/api/payroll/${runId}`, { headers: { Cookie: adminCookie } });
      expect(asAdmin.status).toBe(200);
    });

    it("employee detail: self/admin see salaryStructure, manager doesn't, employee-on-other is blocked", async () => {
      const asOther = await fetch(`${BASE}/api/employees/${otherId}`, { headers: { Cookie: employeeCookie } });
      expect(asOther.status).toBe(403);
      const asSelf = await fetch(`${BASE}/api/employees/${selfId}`, { headers: { Cookie: employeeCookie } });
      expect(asSelf.status).toBe(200);
      expect("salaryStructure" in (await asSelf.json())).toBe(true);
      const asManager = await fetch(`${BASE}/api/employees/${otherId}`, { headers: { Cookie: managerCookie } });
      expect(asManager.status).toBe(200);
      expect("salaryStructure" in (await asManager.json())).toBe(false);
      const asAdmin = await fetch(`${BASE}/api/employees/${otherId}`, { headers: { Cookie: adminCookie } });
      expect(asAdmin.status).toBe(200);
    });

    it("salary revisions: self/admin allowed, manager and employee-on-other blocked", async () => {
      const asOther = await fetch(`${BASE}/api/employees/${otherId}/salary-revisions`, { headers: { Cookie: employeeCookie } });
      expect(asOther.status).toBe(403);
      const asSelf = await fetch(`${BASE}/api/employees/${selfId}/salary-revisions`, { headers: { Cookie: employeeCookie } });
      expect(asSelf.status).toBe(200);
      const asManager = await fetch(`${BASE}/api/employees/${otherId}/salary-revisions`, { headers: { Cookie: managerCookie } });
      expect(asManager.status).toBe(403);
      const asAdmin = await fetch(`${BASE}/api/employees/${otherId}/salary-revisions`, { headers: { Cookie: adminCookie } });
      expect(asAdmin.status).toBe(200);
    });

    it("shift assignment: self/manager/admin allowed, employee-on-other blocked (operational, not financial)", async () => {
      const asOther = await fetch(`${BASE}/api/employees/${otherId}/shift`, { headers: { Cookie: employeeCookie } });
      expect(asOther.status).toBe(403);
      const asSelf = await fetch(`${BASE}/api/employees/${selfId}/shift`, { headers: { Cookie: employeeCookie } });
      expect(asSelf.status).toBe(200);
      const asManager = await fetch(`${BASE}/api/employees/${otherId}/shift`, { headers: { Cookie: managerCookie } });
      expect(asManager.status).toBe(200);
    });

    it("allocated assets: self/manager/admin allowed, employee-on-other blocked (operational, not financial)", async () => {
      const asOther = await fetch(`${BASE}/api/employees/${otherId}/assets`, { headers: { Cookie: employeeCookie } });
      expect(asOther.status).toBe(403);
      const asSelf = await fetch(`${BASE}/api/employees/${selfId}/assets`, { headers: { Cookie: employeeCookie } });
      expect(asSelf.status).toBe(200);
      const asManager = await fetch(`${BASE}/api/employees/${otherId}/assets`, { headers: { Cookie: managerCookie } });
      expect(asManager.status).toBe(200);
    });

    it("loans: self/admin allowed, manager and employee-on-other blocked; unscoped list is admin/hr only", async () => {
      const asOther = await fetch(`${BASE}/api/loans?employeeId=${otherId}`, { headers: { Cookie: employeeCookie } });
      expect(asOther.status).toBe(403);
      const asSelf = await fetch(`${BASE}/api/loans?employeeId=${selfId}`, { headers: { Cookie: employeeCookie } });
      expect(asSelf.status).toBe(200);
      const asManager = await fetch(`${BASE}/api/loans?employeeId=${otherId}`, { headers: { Cookie: managerCookie } });
      expect(asManager.status).toBe(403);
      const listAsEmployee = await fetch(`${BASE}/api/loans`, { headers: { Cookie: employeeCookie } });
      expect(listAsEmployee.status).toBe(403);
      const listAsAdmin = await fetch(`${BASE}/api/loans`, { headers: { Cookie: adminCookie } });
      expect(listAsAdmin.status).toBe(200);
    });

    it("investment declarations: self/admin allowed, manager and employee-on-other blocked", async () => {
      const asOther = await fetch(`${BASE}/api/investment-declarations?employeeId=${otherId}`, { headers: { Cookie: employeeCookie } });
      expect(asOther.status).toBe(403);
      const asSelf = await fetch(`${BASE}/api/investment-declarations?employeeId=${selfId}`, { headers: { Cookie: employeeCookie } });
      expect(asSelf.status).toBe(200);
      const asManager = await fetch(`${BASE}/api/investment-declarations?employeeId=${otherId}`, { headers: { Cookie: managerCookie } });
      expect(asManager.status).toBe(403);
    });

    it("arrears: self/admin allowed, manager and employee-on-other blocked", async () => {
      const asOther = await fetch(`${BASE}/api/arrears?employeeId=${otherId}`, { headers: { Cookie: employeeCookie } });
      expect(asOther.status).toBe(403);
      const asSelf = await fetch(`${BASE}/api/arrears?employeeId=${selfId}`, { headers: { Cookie: employeeCookie } });
      expect(asSelf.status).toBe(200);
      const asManager = await fetch(`${BASE}/api/arrears?employeeId=${otherId}`, { headers: { Cookie: managerCookie } });
      expect(asManager.status).toBe(403);
    });

    it("onboarding tasks: self/admin allowed, manager and employee-on-other blocked", async () => {
      const asOther = await fetch(`${BASE}/api/onboarding/tasks?employeeId=${otherId}`, { headers: { Cookie: employeeCookie } });
      expect(asOther.status).toBe(403);
      const asSelf = await fetch(`${BASE}/api/onboarding/tasks?employeeId=${selfId}`, { headers: { Cookie: employeeCookie } });
      expect(asSelf.status).toBe(200);
      const asManager = await fetch(`${BASE}/api/onboarding/tasks?employeeId=${otherId}`, { headers: { Cookie: managerCookie } });
      expect(asManager.status).toBe(403);
    });

    it("dashboard: employee gets only generic counts; admin/hr/manager get full financial aggregates", async () => {
      const asEmployee = await fetch(`${BASE}/api/dashboard`, { headers: { Cookie: employeeCookie } });
      expect(asEmployee.status).toBe(200);
      const employeeData = await asEmployee.json();
      expect(typeof employeeData.totalEmployees).toBe("number");
      expect(employeeData.payrollSummary).toBeNull();
      expect(employeeData.salaryStats).toBeNull();
      expect(employeeData.recentPayrollRuns).toEqual([]);
      expect(employeeData.departmentCounts).toEqual([]);
      expect(employeeData.exitAnalytics).toEqual({ pendingExitApprovals: 0, employeesInNotice: 0, exitsThisMonth: 0, exitsThisQuarter: 0 });

      const asManager = await fetch(`${BASE}/api/dashboard`, { headers: { Cookie: managerCookie } });
      expect(asManager.status).toBe(200);
      const managerData = await asManager.json();
      expect(Array.isArray(managerData.departmentCounts)).toBe(true);
      expect(managerData.departmentCounts.length).toBeGreaterThan(0);

      const asAdmin = await fetch(`${BASE}/api/dashboard`, { headers: { Cookie: adminCookie } });
      expect(asAdmin.status).toBe(200);
    });
  });

  // ---- Link-existing-login-to-employee feature ----
  describe("link employee to an existing login", () => {
    async function ensureUnlinkedUser(email: string): Promise<string> {
      const createRes = await fetch(`${BASE}/api/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ email, password: "TestEmp@12345", name: "QA Unlinked", role: "employee" }),
      });
      if (createRes.status === 201) return createRes.json().then((r) => r.data.id);
      const listRes = await fetch(`${BASE}/api/users`, { headers: { Cookie: adminCookie } });
      const { data } = await listRes.json();
      const existing = data.find((u: { email: string }) => u.email === email);
      if (!existing) throw new Error(`Expected an existing user for ${email} after a 409, found none`);
      return existing.id;
    }

    it("admin can link an existing unlinked login to a free employee, and unlink it again", async () => {
      const targetEmployeeId = await resolveEmployeeId(adminCookie, "EMP005");
      const userId = await ensureUnlinkedUser("qa.linktest@test.local");

      // Make sure this employee starts unlinked (undo any leftover link from a prior run).
      await fetch(`${BASE}/api/users/${userId}`, {
        method: "PUT", headers: { "Content-Type": "application/json", Cookie: adminCookie }, body: JSON.stringify({ employeeId: null }),
      });

      const linkRes = await fetch(`${BASE}/api/users/${userId}`, {
        method: "PUT", headers: { "Content-Type": "application/json", Cookie: adminCookie }, body: JSON.stringify({ employeeId: targetEmployeeId }),
      });
      expect(linkRes.status).toBe(200);
      const linked = await linkRes.json();
      expect(linked.data.employeeId).toBe(targetEmployeeId);
      expect(linked.data.employee?.employeeCode).toBe("EMP005");

      const unlinkRes = await fetch(`${BASE}/api/users/${userId}`, {
        method: "PUT", headers: { "Content-Type": "application/json", Cookie: adminCookie }, body: JSON.stringify({ employeeId: null }),
      });
      expect(unlinkRes.status).toBe(200);
      const unlinked = await unlinkRes.json();
      expect(unlinked.data.employeeId).toBeNull();
    });

    it("blocks linking to an employee that's already linked to a different login", async () => {
      const targetEmployeeId = await resolveEmployeeId(adminCookie, "EMP005");
      const holderId = await ensureUnlinkedUser("qa.linkholder@test.local");
      const challengerId = await ensureUnlinkedUser("qa.linkchallenger@test.local");

      await fetch(`${BASE}/api/users/${holderId}`, {
        method: "PUT", headers: { "Content-Type": "application/json", Cookie: adminCookie }, body: JSON.stringify({ employeeId: targetEmployeeId }),
      });

      const conflictRes = await fetch(`${BASE}/api/users/${challengerId}`, {
        method: "PUT", headers: { "Content-Type": "application/json", Cookie: adminCookie }, body: JSON.stringify({ employeeId: targetEmployeeId }),
      });
      expect(conflictRes.status).toBe(409);

      // Cleanup: release EMP005 so other runs/tests aren't affected.
      await fetch(`${BASE}/api/users/${holderId}`, {
        method: "PUT", headers: { "Content-Type": "application/json", Cookie: adminCookie }, body: JSON.stringify({ employeeId: null }),
      });
    });

    it("rejects linking to a nonexistent employee, and blocks non-admin roles entirely", async () => {
      const userId = await ensureUnlinkedUser("qa.linktest2@test.local");
      const notFoundRes = await fetch(`${BASE}/api/users/${userId}`, {
        method: "PUT", headers: { "Content-Type": "application/json", Cookie: adminCookie }, body: JSON.stringify({ employeeId: "not-a-real-employee-id" }),
      });
      expect(notFoundRes.status).toBe(404);

      const asManager = await fetch(`${BASE}/api/users/${userId}`, {
        method: "PUT", headers: { "Content-Type": "application/json", Cookie: managerCookie }, body: JSON.stringify({ employeeId: null }),
      });
      expect(asManager.status).toBe(403);
    });
  });

  // ---- Geofence (gap 4) ----
  describe("geofence", () => {
    afterAll(async () => {
      // Always leave enforcement (and login-attendance, enabled by the exemption test below)
      // off, whatever happens above — this must never linger enabled on a shared dev DB just
      // because a test ran.
      await fetch(`${BASE}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ enforceGeofence: false, enableLoginAttendance: false }),
      });
    });

    it("rejects a punch far outside the configured radius when enforcement is on", async () => {
      await fetch(`${BASE}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ officeLatitude: 19.076, officeLongitude: 72.8777, geofenceRadiusMeters: 50, enforceGeofence: true }),
      });

      const res = await fetch(`${BASE}/api/attendance/punch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ employeeId: selfId, action: "in", method: "manual", latitude: 28.6139, longitude: 77.209 }), // Mumbai office, Delhi punch
      });
      expect(res.status).toBe(400);
    });

    it("does not reject a punch inside the configured radius", async () => {
      const res = await fetch(`${BASE}/api/attendance/punch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ employeeId: selfId, action: "in", method: "manual", latitude: 19.0761, longitude: 72.8778 }),
      });
      // Never 400 (geofence) — 201/409 both prove the geofence check itself passed.
      expect(res.status).not.toBe(400);
      expect([201, 409]).toContain(res.status);
    });

    it("rejects an interactive (manual) punch with no coordinates at all when enforcement is on — the actual bug: enforcement was previously silently bypassable just by denying location", async () => {
      const res = await fetch(`${BASE}/api/attendance/punch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ employeeId: selfId, action: "in", method: "manual" }), // no latitude/longitude
      });
      expect(res.status).toBe(400);
      const { error } = await res.json();
      expect(error).toMatch(/location/i);
    });

    it("does not reject a login-triggered punch even with no coordinates, when enforcement is on (login punches never have any, by design)", async () => {
      // A different employee than EMP001-EMP005 deliberately — those are claimed by other
      // describe blocks (self/other/exit/link-employee/login-based-attendance) elsewhere in
      // this file, and linking a login to one here would collide with their expectations.
      const freshEmployeeId = await resolveEmployeeId(adminCookie, "EMP0007");
      await fetch(`${BASE}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ enableLoginAttendance: true }),
      });
      await ensureEmployeeLogin(adminCookie, "qa.employee7geofence@test.local", freshEmployeeId);

      // No date filter (rather than computing "today" client-side) — the record's `date` is
      // stored as an IST calendar date server-side (see istDateOnly()), which can differ from
      // the UTC date right around IST midnight, making a client-computed date param flaky.
      const res = await fetch(`${BASE}/api/attendance?employeeId=${freshEmployeeId}`, { headers: { Cookie: adminCookie } });
      const { data } = await res.json();
      expect(data.length).toBeGreaterThan(0);
      expect(data[0].punchInMethod).toBe("login");
    });
  });

  // ---- Login-based attendance (gap 6) ----
  describe("login-based attendance", () => {
    afterAll(async () => {
      await fetch(`${BASE}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ enableLoginAttendance: false }),
      });
    });

    it("marks an employee present on login once enabled, for a login not already punched today", async () => {
      const freshEmployeeId = await resolveEmployeeId(adminCookie, "EMP004");

      await fetch(`${BASE}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ enableLoginAttendance: true }),
      });

      await ensureEmployeeLogin(adminCookie, "qa.employee4@test.local", freshEmployeeId);

      const today = new Date().toISOString().split("T")[0];
      const res = await fetch(`${BASE}/api/attendance?employeeId=${freshEmployeeId}&date=${today}`, { headers: { Cookie: adminCookie } });
      const { data } = await res.json();
      expect(data.length).toBeGreaterThan(0);
      expect(data[0].punchInMethod).toBe("login");
    });
  });

  // ---- Bank Transfer Formats ----
  describe("bank formats", () => {
    async function createBankFormat(cookie: string, name: string, isDefault: boolean) {
      const form = new FormData();
      form.set("name", name);
      form.set("isDefault", String(isDefault));
      form.set(
        "columns",
        JSON.stringify([
          { order: 0, header: "Account Number", source: "field", field: "accountNumber" },
          { order: 1, header: "IFSC", source: "field", field: "ifsc" },
          { order: 2, header: "Name", source: "field", field: "beneficiaryName" },
          { order: 3, header: "Amount", source: "field", field: "amount" },
          { order: 4, header: "Mode", source: "fixed", fixedValue: "NEFT" },
        ])
      );
      return fetch(`${BASE}/api/bank-formats`, { method: "POST", headers: { Cookie: cookie }, body: form });
    }

    afterAll(async () => {
      // Clean up every format this describe block created, so repeated runs stay idempotent.
      const list = await fetch(`${BASE}/api/bank-formats`, { headers: { Cookie: adminCookie } });
      const { data } = await list.json();
      for (const f of data as { id: string; name: string }[]) {
        if (f.name.startsWith("QA Test Bank")) {
          await fetch(`${BASE}/api/bank-formats/${f.id}`, { method: "DELETE", headers: { Cookie: adminCookie } });
        }
      }
    });

    it("admin can create a bank format; manager and employee are blocked entirely", async () => {
      const asManager = await createBankFormat(managerCookie, "QA Test Bank Manager Attempt", false);
      expect(asManager.status).toBe(403);
      const asEmployee = await createBankFormat(employeeCookie, "QA Test Bank Employee Attempt", false);
      expect(asEmployee.status).toBe(403);

      const asAdmin = await createBankFormat(adminCookie, `QA Test Bank ${Date.now()}`, false);
      expect(asAdmin.status).toBe(201);
      const created = await asAdmin.json();
      expect(created.data.columns.length).toBe(5);
    });

    it("marking a new format as default un-defaults the previous default", async () => {
      const first = await createBankFormat(adminCookie, `QA Test Bank First ${Date.now()}`, true);
      const firstData = (await first.json()).data;
      expect(firstData.isDefault).toBe(true);

      const second = await createBankFormat(adminCookie, `QA Test Bank Second ${Date.now()}`, true);
      const secondData = (await second.json()).data;
      expect(secondData.isDefault).toBe(true);

      const listRes = await fetch(`${BASE}/api/bank-formats`, { headers: { Cookie: adminCookie } });
      const { data } = await listRes.json();
      const refreshedFirst = data.find((f: { id: string }) => f.id === firstData.id);
      expect(refreshedFirst.isDefault).toBe(false);
    });

    it("generates a real, non-empty .xlsx using a configured bank format, and leaves the generic CSV path unchanged", async () => {
      const reportYear = 2100; // same fixture slot used by the reports test — guaranteed to have a run
      const runList = await fetch(`${BASE}/api/payroll?month=11&year=${reportYear}`, { headers: { Cookie: adminCookie } });
      const runs = await runList.json();
      const runId = runs[0]?.id;
      expect(runId).toBeTruthy();

      // The bank-file route requires a non-draft run — move it forward if this is the first
      // time anything has touched this fixture run; tolerate 400 if it's already past draft.
      await fetch(`${BASE}/api/payroll/${runId}`, {
        method: "PUT", headers: { "Content-Type": "application/json", Cookie: adminCookie }, body: JSON.stringify({ status: "processed" }),
      });

      const formatRes = await createBankFormat(adminCookie, `QA Test Bank XlsxGen ${Date.now()}`, false);
      const format = (await formatRes.json()).data;

      const xlsxRes = await fetch(`${BASE}/api/payroll/${runId}/bank-file?format=xlsx&bankFormatId=${format.id}`, {
        headers: { Cookie: adminCookie },
      });
      expect(xlsxRes.status).toBe(200);
      expect(xlsxRes.headers.get("content-type")).toContain("spreadsheetml");
      const xlsxBuffer = await xlsxRes.arrayBuffer();
      expect(xlsxBuffer.byteLength).toBeGreaterThan(1000); // a real workbook, not an empty stub

      // Regression guard: the original generic CSV path (no bankFormatId) is untouched.
      const csvRes = await fetch(`${BASE}/api/payroll/${runId}/bank-file?format=csv`, { headers: { Cookie: adminCookie } });
      expect(csvRes.status).toBe(200);
      expect(csvRes.headers.get("content-type")).toContain("text/csv");
    });

    it("rejects format=xlsx with an explicit bankFormatId that doesn't exist", async () => {
      // Deterministic regardless of shared state from earlier tests in this file (unlike "is
      // anything currently default", which earlier tests may have already made true) — an
      // explicit, nonexistent id must always 400, full stop.
      const reportYear = 2100;
      const runList = await fetch(`${BASE}/api/payroll?month=11&year=${reportYear}`, { headers: { Cookie: adminCookie } });
      const runs = await runList.json();
      const runId = runs[0]?.id;

      const res = await fetch(`${BASE}/api/payroll/${runId}/bank-file?format=xlsx&bankFormatId=not-a-real-id`, { headers: { Cookie: adminCookie } });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/not found/i);
    });
  });
});
