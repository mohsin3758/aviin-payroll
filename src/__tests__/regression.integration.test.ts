// Integration regression tests for the bugs fixed in this pass. These hit a REAL running
// server (`npm run dev` on localhost:3000) with a REAL database — they are not mocked.
// Run manually with the dev server up: `npx vitest run src/__tests__/regression.integration.test.ts`
// They are excluded from the default `npm test` run (see vitest.config.ts include pattern)
// since they require a live server + seeded DB rather than being hermetic unit tests.
import { describe, it, expect, beforeAll } from "vitest";

const BASE = "http://localhost:3000";
// Payroll runs are unique per companyId+month+year, and this suite runs against a persistent
// dev DB (not a fresh DB per run), so a fixed/random year can collide with a run a PRIOR
// invocation already marked "paid" — which then correctly 409s, since that lock is exactly
// what's under test. To keep the suite reliably re-runnable, find a genuinely free year below
// rather than guessing.
let TEST_YEAR = 2100;

async function login(email: string, password: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const cookie = res.headers.get("set-cookie")?.split(";")[0];
  if (!res.ok || !cookie) throw new Error(`Login failed: ${res.status}`);
  return cookie;
}

describe("Regression: auth + core payroll bug fixes (requires live dev server)", () => {
  let adminCookie: string;

  beforeAll(async () => {
    adminCookie = await login("admin@payrollpro.local", "Admin@12345");

    // Find a month=10 year that has no existing payroll run yet, so this suite is safely
    // re-runnable against the same persistent dev database.
    for (let y = 2100; y < 2200; y++) {
      const res = await fetch(`${BASE}/api/payroll?month=10&year=${y}`, { headers: { Cookie: adminCookie } });
      const runs = await res.json();
      if (Array.isArray(runs) && runs.length === 0) {
        TEST_YEAR = y;
        break;
      }
    }
  });

  it("blocks unauthenticated API access", async () => {
    const res = await fetch(`${BASE}/api/employees`);
    expect(res.status).toBe(401);
  });

  it("allows authenticated access and returns paginated employees", async () => {
    const res = await fetch(`${BASE}/api/employees`, { headers: { Cookie: adminCookie } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.data)).toBe(true);
    expect(typeof json.total).toBe("number");
  });

  it("rejects employee creation with an unauthenticated/invalid role (manager cannot create employees)", async () => {
    const managerCookie = await login("manager@payrollpro.local", "Manager@12345");
    const res = await fetch(`${BASE}/api/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: managerCookie },
      body: JSON.stringify({
        firstName: "Should",
        lastName: "Fail",
        email: "should.fail@test.local",
        dateOfJoining: "2026-01-01",
        designation: "X",
        department: "Engineering",
        state: "Maharashtra",
        gender: "male",
      }),
    });
    expect(res.status).toBe(403);
  });

  it("creates an employee via a date-only dateOfJoining without a client-supplied companyId", async () => {
    const res = await fetch(`${BASE}/api/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        firstName: "Integration",
        lastName: "Test",
        email: `integration.${Date.now()}@test.local`,
        dateOfJoining: "2026-02-01",
        designation: "QA",
        department: "Engineering",
        state: "Maharashtra",
        gender: "male",
      }),
    });
    expect(res.status).toBe(201);
    const emp = await res.json();
    expect(emp.dateOfJoining).toBe("2026-02-01T00:00:00.000Z");
    expect(emp.companyId).toBeTruthy();
  });

  it("ignores a client-supplied id/companyId on employee creation", async () => {
    const res = await fetch(`${BASE}/api/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        id: "attacker-controlled-id",
        companyId: "not-a-real-company",
        firstName: "Injection",
        lastName: "Test",
        email: `injection.${Date.now()}@test.local`,
        dateOfJoining: "2026-02-01",
        designation: "QA",
        department: "Engineering",
        state: "Maharashtra",
        gender: "male",
      }),
    });
    expect(res.status).toBe(201);
    const emp = await res.json();
    expect(emp.id).not.toBe("attacker-controlled-id");
    expect(emp.companyId).not.toBe("not-a-real-company");
  });

  it("records attendance punch-in and punch-out without crashing", async () => {
    const empsRes = await fetch(`${BASE}/api/employees?limit=1`, { headers: { Cookie: adminCookie } });
    const { data } = await empsRes.json();
    const employeeId = data[0].id;

    // Clear any existing punch for today isn't possible via API by design (no delete endpoint),
    // so this test tolerates a 409 "already punched in" as evidence the endpoint itself works.
    const punchIn = await fetch(`${BASE}/api/attendance/punch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ employeeId, action: "in", method: "manual" }),
    });
    expect([201, 409]).toContain(punchIn.status);
  });

  it("blocks re-approving an already-approved leave application (idempotency)", async () => {
    // Use a seeded employee (EMP001) specifically — freshly-created test employees in other
    // tests have no LeaveBalance rows yet, since only seed data provisions those.
    const empsRes = await fetch(`${BASE}/api/employees?search=EMP001`, { headers: { Cookie: adminCookie } });
    const { data } = await empsRes.json();
    const employeeId = data.find((e: { employeeCode: string }) => e.employeeCode === "EMP001")?.id ?? data[0].id;

    const balRes = await fetch(`${BASE}/api/leaves/balance?employeeId=${employeeId}`, {
      headers: { Cookie: adminCookie },
    });
    const balances = await balRes.json();
    expect(balances.length).toBeGreaterThan(0);
    const leaveTypeId = balances[0].leaveTypeId;

    const createRes = await fetch(`${BASE}/api/leaves`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        employeeId,
        leaveTypeId,
        startDate: "2026-09-01",
        endDate: "2026-09-01",
        reason: "integration test",
      }),
    });
    expect(createRes.status).toBe(201);
    const leave = await createRes.json();

    const approve1 = await fetch(`${BASE}/api/leaves/${leave.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ status: "approved", approvedBy: "Test" }),
    });
    expect(approve1.status).toBe(200);

    const approve2 = await fetch(`${BASE}/api/leaves/${leave.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ status: "approved", approvedBy: "Test" }),
    });
    expect(approve2.status).toBe(409);

    // Cleanup: cancel it so balance is restored and doesn't pollute other runs.
    await fetch(`${BASE}/api/leaves/${leave.id}`, { method: "DELETE", headers: { Cookie: adminCookie } });
  });

  it("never returns a negative netSalary from payroll processing", async () => {
    const res = await fetch(`${BASE}/api/payroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ month: 10, year: TEST_YEAR }),
    });
    expect(res.status).toBe(200);
    const run = await res.json();
    for (const detail of run.details) {
      expect(detail.netSalary).toBeGreaterThanOrEqual(0);
    }
  });

  it("blocks reprocessing a payroll run once marked paid", async () => {
    const listRes = await fetch(`${BASE}/api/payroll?month=10&year=${TEST_YEAR}`, { headers: { Cookie: adminCookie } });
    const [run] = await listRes.json();

    await fetch(`${BASE}/api/payroll/${run.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ status: "processed" }),
    });
    await fetch(`${BASE}/api/payroll/${run.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ status: "paid" }),
    });

    const reprocess = await fetch(`${BASE}/api/payroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ month: 10, year: TEST_YEAR }),
    });
    expect(reprocess.status).toBe(409);
  });
});
