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
  });

  // ---- Geofence (gap 4) ----
  describe("geofence", () => {
    afterAll(async () => {
      // Always leave enforcement off, whatever happens above — this must never linger enabled
      // on a shared dev DB just because a test ran.
      await fetch(`${BASE}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ enforceGeofence: false }),
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
});
