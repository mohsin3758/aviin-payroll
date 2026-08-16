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
  let selfId: string; // EMP001 — the "in-scope" employee for scoped tests
  let otherId: string; // EMP002 — the "out-of-scope" employee for scoped tests
  const createdArrearIds: string[] = [];

  beforeAll(async () => {
    adminCookie = await login("admin@payrollpro.local", "Admin@12345");
    const hr = await ensureLogin(adminCookie, "qa.payrollaccess.hr@test.local", "hr");
    hrCookie = hr.cookie;
    hrId = hr.id;
    selfId = await resolveEmployeeId(adminCookie, "EMP001");
    otherId = await resolveEmployeeId(adminCookie, "EMP002");
  });

  afterAll(async () => {
    // Leave this hr user fully unrestricted so it doesn't affect any later run of this suite.
    await setPayrollAccess(adminCookie, hrId, [], []);
    if (createdArrearIds.length) {
      await db.salaryArrear.deleteMany({ where: { id: { in: createdArrearIds } } });
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
});
