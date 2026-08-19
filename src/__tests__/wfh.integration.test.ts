// Integration tests for the WFH (Work From Home) request/approval feature
// (src/app/api/wfh/*, src/app/api/ess/wfh/*, the geofence-skip in src/lib/attendance-punch.ts).
// These hit a REAL running server (`npm run dev` on localhost:3000) with a REAL database — not
// mocked. Excluded from the default `npm test` run (see vitest.integration.config.ts) since they
// require a live server + seeded DB.
// Run manually with the dev server up:
// npx vitest run --config vitest.integration.config.ts src/__tests__/wfh.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { istDateOnly } from "@/lib/date-ist";

const BASE = "http://localhost:3000";
// Mumbai office coords / radius, matching the existing geofence describe block in
// access-control.integration.test.ts — Delhi is "far away" (well outside any sane radius).
const OFFICE_LAT = 19.076;
const OFFICE_LNG = 72.8777;
const RADIUS_M = 50;
const FAR_AWAY_LAT = 28.6139;
const FAR_AWAY_LNG = 77.209;

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
  const password = "TestWfh@12345";
  const res = await fetch(`${BASE}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ email, password, name: "QA WFH", role, employeeId }),
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

async function createDisposableEmployee(adminCookie: string, label: string): Promise<string> {
  const res = await fetch(`${BASE}/api/employees`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      firstName: "QA", lastName: label, email: `qa.wfh.${label.toLowerCase()}.${Date.now()}@test.local`,
      designation: "QA Engineer", department: "Quality", dateOfJoining: "2020-01-01", pfApplicable: true,
      salaryStructure: { basic: 20000, houseRentAllowance: 8000, specialAllowance: 2000 },
    }),
  });
  if (!res.ok) throw new Error(`Failed to create disposable WFH employee ${label}: ${res.status} ${await res.text()}`);
  const emp = await res.json();
  return emp.id as string;
}

// IST-aware, matching istDateOnly()'s semantics — a raw d.toISOString().slice(0,10) would
// misattribute a date near IST midnight (00:00-05:29 IST is still the previous UTC calendar
// day), the exact bug istDateOnly() itself exists to avoid.
function isoDate(d: Date): string {
  return istDateOnly(d).toISOString().slice(0, 10);
}

describe("WFH request/approval (requires live dev server)", () => {
  let adminCookie: string;
  let hrCookie: string;
  let hrId: string;
  let managerCookie: string;
  let selfId: string; // EMP001
  let otherId: string; // EMP002
  const createdEmployeeIds: string[] = [];
  const createdWfhIds: string[] = [];

  beforeAll(async () => {
    adminCookie = await login("admin@payrollpro.local", "Admin@12345");
    const hr = await ensureLogin(adminCookie, "qa.wfh.hr@test.local", "hr");
    hrCookie = hr.cookie;
    hrId = hr.id;
    managerCookie = await login("manager@payrollpro.local", "Manager@12345");
    selfId = await resolveEmployeeId(adminCookie, "EMP001");
    otherId = await resolveEmployeeId(adminCookie, "EMP002");
  });

  afterAll(async () => {
    await setPayrollAccess(adminCookie, hrId, [], []);
    if (createdWfhIds.length) {
      await db.wfhRequest.deleteMany({ where: { id: { in: createdWfhIds } } });
    }
    if (createdEmployeeIds.length) {
      await db.attendance.deleteMany({ where: { employeeId: { in: createdEmployeeIds } } });
      await db.wfhRequest.deleteMany({ where: { employeeId: { in: createdEmployeeIds } } });
      await db.salaryStructure.deleteMany({ where: { employeeId: { in: createdEmployeeIds } } });
      await db.employee.deleteMany({ where: { id: { in: createdEmployeeIds } } });
    }
  });

  it("employee creates a WFH request via POST /api/ess/wfh", async () => {
    // A fresh disposable employee, not the shared EMP001/EMP002 — those already have a linked
    // login from other integration suites in this shared dev DB, and Employee.user is one-to-one
    // (POST /api/users 409s "This employee already has a portal login" for a second attempt).
    const employeeId = await createDisposableEmployee(adminCookie, "EssCreate");
    createdEmployeeIds.push(employeeId);
    const employeeCookie = (await ensureLogin(adminCookie, `qa.wfh.emp1.${Date.now()}@test.local`, "employee", employeeId)).cookie;
    const start = isoDate(new Date(Date.now() + 7 * 86400000));
    const end = isoDate(new Date(Date.now() + 9 * 86400000));

    const res = await fetch(`${BASE}/api/ess/wfh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: employeeCookie },
      body: JSON.stringify({ startDate: start, endDate: end, reason: "QA integration test" }),
    });
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data.status).toBe("pending");
    createdWfhIds.push(data.id);

    const listRes = await fetch(`${BASE}/api/wfh?employeeId=${employeeId}&status=pending`, { headers: { Cookie: adminCookie } });
    expect(listRes.status).toBe(200);
    const { data: list } = await listRes.json();
    expect(list.some((r: { id: string }) => r.id === data.id)).toBe(true);
  });

  it("approve is idempotent — a second approve attempt 409s", async () => {
    const start = isoDate(new Date(Date.now() + 14 * 86400000));
    const end = isoDate(new Date(Date.now() + 15 * 86400000));
    const createRes = await fetch(`${BASE}/api/wfh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ employeeId: otherId, startDate: start, endDate: end }),
    });
    expect(createRes.status).toBe(201);
    const { data: created } = await createRes.json();
    createdWfhIds.push(created.id);

    const approve1 = await fetch(`${BASE}/api/wfh/${created.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ status: "approved" }),
    });
    expect(approve1.status).toBe(200);
    const approved = await approve1.json();
    expect(approved.approvedAt).toBeTruthy();

    const approve2 = await fetch(`${BASE}/api/wfh/${created.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ status: "approved" }),
    });
    expect(approve2.status).toBe(409);
  });

  it("hr scoped to manage_wfh can approve; hr without it is 403'd", async () => {
    const start = isoDate(new Date(Date.now() + 21 * 86400000));
    const end = isoDate(new Date(Date.now() + 22 * 86400000));
    const createRes = await fetch(`${BASE}/api/wfh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ employeeId: otherId, startDate: start, endDate: end }),
    });
    const { data: created } = await createRes.json();
    createdWfhIds.push(created.id);

    await setPayrollAccess(adminCookie, hrId, ["view_reports"], []);
    const denied = await fetch(`${BASE}/api/wfh/${created.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: hrCookie },
      body: JSON.stringify({ status: "approved" }),
    });
    expect(denied.status).toBe(403);

    await setPayrollAccess(adminCookie, hrId, ["manage_wfh"], []);
    const allowed = await fetch(`${BASE}/api/wfh/${created.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: hrCookie },
      body: JSON.stringify({ status: "approved" }),
    });
    expect(allowed.status).toBe(200);
  });

  it("employee cancels their own pending request but 403s on someone else's", async () => {
    const employeeAId = await createDisposableEmployee(adminCookie, "EssCancelA");
    const employeeBId = await createDisposableEmployee(adminCookie, "EssCancelB");
    createdEmployeeIds.push(employeeAId, employeeBId);
    const employeeCookie = (await ensureLogin(adminCookie, `qa.wfh.emp1.${Date.now()}@test.local`, "employee", employeeAId)).cookie;
    const otherEmployeeCookie = (await ensureLogin(adminCookie, `qa.wfh.emp2.${Date.now()}@test.local`, "employee", employeeBId)).cookie;

    const start = isoDate(new Date(Date.now() + 28 * 86400000));
    const end = isoDate(new Date(Date.now() + 29 * 86400000));
    const createRes = await fetch(`${BASE}/api/ess/wfh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: employeeCookie },
      body: JSON.stringify({ startDate: start, endDate: end }),
    });
    const { data: created } = await createRes.json();
    createdWfhIds.push(created.id);

    const forbidden = await fetch(`${BASE}/api/wfh/${created.id}`, { method: "DELETE", headers: { Cookie: otherEmployeeCookie } });
    expect(forbidden.status).toBe(403);

    const ok = await fetch(`${BASE}/api/wfh/${created.id}`, { method: "DELETE", headers: { Cookie: employeeCookie } });
    expect(ok.status).toBe(200);
    const cancelled = await ok.json();
    expect(cancelled.status).toBe("cancelled");
  });

  describe("geofence skip", () => {
    afterAll(async () => {
      // Always leave enforcement off, whatever happens above — must never linger enabled on a
      // shared dev DB just because this suite ran.
      await fetch(`${BASE}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ enforceGeofence: false }),
      });
    });

    it("skips the geofence check and tags workMode 'wfh' for a punch on an approved WFH day", async () => {
      const employeeId = await createDisposableEmployee(adminCookie, "WfhToday");
      createdEmployeeIds.push(employeeId);

      const today = isoDate(new Date());
      const createRes = await fetch(`${BASE}/api/wfh`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ employeeId, startDate: today, endDate: today }),
      });
      const { data: created } = await createRes.json();
      const approveRes = await fetch(`${BASE}/api/wfh/${created.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ status: "approved" }),
      });
      expect(approveRes.status).toBe(200);

      await fetch(`${BASE}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ officeLatitude: OFFICE_LAT, officeLongitude: OFFICE_LNG, geofenceRadiusMeters: RADIUS_M, enforceGeofence: true }),
      });

      const punchRes = await fetch(`${BASE}/api/attendance/punch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ employeeId, action: "in", method: "manual", latitude: FAR_AWAY_LAT, longitude: FAR_AWAY_LNG }),
      });
      expect(punchRes.status).toBe(201);
      const { data: attendance } = await punchRes.json();
      expect(attendance.workMode).toBe("wfh");
    });

    it("still rejects a far-away punch on a day outside the approved WFH range (proves the exemption is date-bound, not blanket)", async () => {
      const employeeId = await createDisposableEmployee(adminCookie, "WfhFuture");
      createdEmployeeIds.push(employeeId);

      // Approved, but for a future range that does NOT include today.
      const futureStart = isoDate(new Date(Date.now() + 10 * 86400000));
      const futureEnd = isoDate(new Date(Date.now() + 12 * 86400000));
      const createRes = await fetch(`${BASE}/api/wfh`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ employeeId, startDate: futureStart, endDate: futureEnd }),
      });
      const { data: created } = await createRes.json();
      await fetch(`${BASE}/api/wfh/${created.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ status: "approved" }),
      });

      await fetch(`${BASE}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ officeLatitude: OFFICE_LAT, officeLongitude: OFFICE_LNG, geofenceRadiusMeters: RADIUS_M, enforceGeofence: true }),
      });

      const punchRes = await fetch(`${BASE}/api/attendance/punch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ employeeId, action: "in", method: "manual", latitude: FAR_AWAY_LAT, longitude: FAR_AWAY_LNG }),
      });
      expect(punchRes.status).toBe(400);
    });

    it("leaves workMode null on an ordinary punch with no WFH request at all (regression guard)", async () => {
      const employeeId = await createDisposableEmployee(adminCookie, "NoWfh");
      createdEmployeeIds.push(employeeId);

      await fetch(`${BASE}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ officeLatitude: OFFICE_LAT, officeLongitude: OFFICE_LNG, geofenceRadiusMeters: RADIUS_M, enforceGeofence: true }),
      });

      const punchRes = await fetch(`${BASE}/api/attendance/punch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ employeeId, action: "in", method: "manual", latitude: OFFICE_LAT, longitude: OFFICE_LNG }),
      });
      expect(punchRes.status).toBe(201);
      const { data: attendance } = await punchRes.json();
      expect(attendance.workMode).toBeFalsy();
    });
  });
});
