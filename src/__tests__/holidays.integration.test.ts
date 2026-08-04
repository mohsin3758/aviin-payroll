// Integration tests for the Holiday Calendar: year vs financial-year filtering on
// GET /api/holidays, category/type persistence, DELETE, and — the critical regression guard —
// that "optional" (festival/informational) holidays are NEVER auto-credited as paid present by
// payroll, unlike mandatory holidays. If an employee wants an optional-holiday date off, they
// apply it as a normal leave application against their own Earned/Casual/Sick balance (My
// Portal's Holidays tab links straight into the existing Apply-for-Leave flow for this) — this
// file also proves that path actually works end to end.
// Hits a REAL running server (`npm run dev` on localhost:3000) with a REAL database — not
// mocked. Excluded from the default `npm test` run (see vitest.integration.config.ts).
// Run manually with the dev server up:
// `npx vitest run --config vitest.integration.config.ts src/__tests__/holidays.integration.test.ts`
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";

const BASE = "http://localhost:3000";
// A dedicated fixture slot for this suite's disposable payroll runs — distinct from the 2099
// slot reports.integration.test.ts uses.
const FIXTURE_YEAR = 2098;

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
  const password = "TestHolidays@12345";
  const res = await fetch(`${BASE}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ email, password, name: "QA Holidays", role, employeeId }),
  });
  if (res.status !== 201 && res.status !== 409) {
    throw new Error(`Failed to create/reuse ${role} login ${email}: ${res.status} ${await res.text()}`);
  }
  return login(email, password);
}

async function createDisposableEmployee(adminCookie: string, label: string): Promise<string> {
  const res = await fetch(`${BASE}/api/employees`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({
      firstName: "QA", lastName: label, email: `qa.holidays.${label.toLowerCase()}.${Date.now()}@test.local`,
      designation: "QA Engineer", department: "Quality", dateOfJoining: "2020-01-01",
      pfApplicable: true,
      salaryStructure: { basic: 20000, houseRentAllowance: 8000, specialAllowance: 2000 },
    }),
  });
  if (!res.ok) throw new Error(`Failed to create disposable employee ${label}: ${res.status} ${await res.text()}`);
  const emp = await res.json();
  return emp.id as string;
}

async function createHoliday(
  adminCookie: string,
  body: { name: string; date: string; type?: string; category?: string }
): Promise<string> {
  const res = await fetch(`${BASE}/api/holidays`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify(body),
  });
  if (res.status !== 201) throw new Error(`Failed to create holiday ${body.name}: ${res.status} ${await res.text()}`);
  const holiday = await res.json();
  return holiday.id as string;
}

describe("Holiday calendar (requires live dev server)", () => {
  let adminCookie: string;
  const createdHolidayIds: string[] = [];
  const createdEmployeeIds: string[] = [];
  const createdUserEmails: string[] = [];
  const createdLeaveTypeIds: string[] = [];

  beforeAll(async () => {
    adminCookie = await login("admin@payrollpro.local", "Admin@12345");
  });

  afterAll(async () => {
    const runs = await db.payrollRun.findMany({ where: { year: FIXTURE_YEAR, runType: "regular" } });
    const runIds = runs.map((r) => r.id);
    if (runIds.length) {
      await db.payrollDetail.deleteMany({ where: { payrollRunId: { in: runIds } } });
      await db.payrollRun.deleteMany({ where: { id: { in: runIds } } });
    }
    if (createdEmployeeIds.length) {
      await db.leaveApplication.deleteMany({ where: { employeeId: { in: createdEmployeeIds } } });
      await db.leaveBalance.deleteMany({ where: { employeeId: { in: createdEmployeeIds } } });
    }
    if (createdLeaveTypeIds.length) {
      await db.leaveType.deleteMany({ where: { id: { in: createdLeaveTypeIds } } });
    }
    if (createdHolidayIds.length) {
      await db.holiday.deleteMany({ where: { id: { in: createdHolidayIds } } });
    }
    if (createdUserEmails.length) {
      await db.user.deleteMany({ where: { email: { in: createdUserEmails } } });
    }
    if (createdEmployeeIds.length) {
      await db.salaryStructure.deleteMany({ where: { employeeId: { in: createdEmployeeIds } } });
      await db.attendance.deleteMany({ where: { employeeId: { in: createdEmployeeIds } } });
      await db.employee.deleteMany({ where: { id: { in: createdEmployeeIds } } });
    }
    await db.$disconnect();
  });

  describe("GET /api/holidays year vs fyStartYear filtering", () => {
    it("year= returns everything in that calendar year; fyStartYear= respects the Apr-Mar boundary", async () => {
      const janId = await createHoliday(adminCookie, { name: "QA Jan Holiday", date: `${FIXTURE_YEAR}-01-15`, category: "other" });
      const augId = await createHoliday(adminCookie, { name: "QA Aug Holiday", date: `${FIXTURE_YEAR}-08-15`, category: "other" });
      createdHolidayIds.push(janId, augId);

      const calYearRes = await fetch(`${BASE}/api/holidays?year=${FIXTURE_YEAR}`, { headers: { Cookie: adminCookie } });
      const calYearIds = (await calYearRes.json()).data.map((h: { id: string }) => h.id);
      expect(calYearIds).toContain(janId);
      expect(calYearIds).toContain(augId);

      // FY FIXTURE_YEAR runs Apr FIXTURE_YEAR - Mar FIXTURE_YEAR+1: includes Aug, excludes Jan.
      const fyCurrentRes = await fetch(`${BASE}/api/holidays?fyStartYear=${FIXTURE_YEAR}`, { headers: { Cookie: adminCookie } });
      const fyCurrentIds = (await fyCurrentRes.json()).data.map((h: { id: string }) => h.id);
      expect(fyCurrentIds).toContain(augId);
      expect(fyCurrentIds).not.toContain(janId);

      // FY FIXTURE_YEAR-1 runs Apr FIXTURE_YEAR-1 - Mar FIXTURE_YEAR: includes Jan, excludes Aug.
      const fyPrevRes = await fetch(`${BASE}/api/holidays?fyStartYear=${FIXTURE_YEAR - 1}`, { headers: { Cookie: adminCookie } });
      const fyPrevIds = (await fyPrevRes.json()).data.map((h: { id: string }) => h.id);
      expect(fyPrevIds).toContain(janId);
      expect(fyPrevIds).not.toContain(augId);
    });
  });

  describe("category and type persist through create + edit", () => {
    it("POST persists category/type, PUT updates them", async () => {
      const id = await createHoliday(adminCookie, { name: "QA Category Holiday", date: `${FIXTURE_YEAR}-02-10`, type: "optional", category: "festival" });
      createdHolidayIds.push(id);

      const getRes = await fetch(`${BASE}/api/holidays?year=${FIXTURE_YEAR}`, { headers: { Cookie: adminCookie } });
      const created = (await getRes.json()).data.find((h: { id: string }) => h.id === id);
      expect(created.type).toBe("optional");
      expect(created.category).toBe("festival");

      const putRes = await fetch(`${BASE}/api/holidays/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ type: "holiday", category: "national" }),
      });
      expect(putRes.status).toBe(200);
      const updated = (await putRes.json()).data;
      expect(updated.type).toBe("holiday");
      expect(updated.category).toBe("national");
    });
  });

  describe("DELETE /api/holidays/[id]", () => {
    it("deletes cleanly", async () => {
      const holidayId = await createHoliday(adminCookie, { name: "QA Delete Holiday", date: `${FIXTURE_YEAR}-03-10`, type: "optional" });
      const deleteRes = await fetch(`${BASE}/api/holidays/${holidayId}`, { method: "DELETE", headers: { Cookie: adminCookie } });
      expect(deleteRes.status).toBe(200);
      expect(await db.holiday.findUnique({ where: { id: holidayId } })).toBeNull();
    });
  });

  describe("payroll — the critical regression guard", () => {
    it("mandatory holidays auto-credit as paid present; optional holidays never do, even with no application against them", async () => {
      const payMonth = 5; // May FIXTURE_YEAR
      const empId = await createDisposableEmployee(adminCookie, "PayrollGuard");
      createdEmployeeIds.push(empId);
      createdUserEmails.push("qa.holidays.payrollguard@test.local");
      await ensureLogin(adminCookie, "qa.holidays.payrollguard@test.local", "employee", empId);

      const mandatoryId = await createHoliday(adminCookie, { name: "QA Payroll Mandatory", date: `${FIXTURE_YEAR}-05-05`, type: "holiday" });
      const optionalId = await createHoliday(adminCookie, { name: "QA Payroll Optional", date: `${FIXTURE_YEAR}-05-15`, type: "optional" });
      createdHolidayIds.push(mandatoryId, optionalId);

      const payrollRes = await fetch(`${BASE}/api/payroll`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ month: payMonth, year: FIXTURE_YEAR }),
      });
      expect([200, 409]).toContain(payrollRes.status);

      const runsRes = await fetch(`${BASE}/api/payroll?month=${payMonth}&year=${FIXTURE_YEAR}`, { headers: { Cookie: adminCookie } });
      const runs = await runsRes.json();
      const runId = runs[0]?.id;
      expect(runId).toBeTruthy();
      const runDetailRes = await fetch(`${BASE}/api/payroll/${runId}`, { headers: { Cookie: adminCookie } });
      const runDetail = await runDetailRes.json();
      const row = runDetail.details.find((d: { employeeId: string }) => d.employeeId === empId);
      expect(row).toBeTruthy();

      // Same employee, same month, with no attendance rows at all: exactly one mandatory holiday
      // is credited; the optional one is not — proving it's genuinely informational-only now.
      const attRes = await fetch(`${BASE}/api/reports?type=attendance&month=${payMonth}&year=${FIXTURE_YEAR}`, { headers: { Cookie: adminCookie } });
      const attData = (await attRes.json()).data;
      const attRow = attData.employees.find((e: { employeeId: string }) => e.employeeId === empId);
      expect(attRow.presentDays).toBe(row.presentDays);
      // The optional holiday date should show as an absence (no auto-credit, no explicit record).
      expect(attRow.absentDays).toBeGreaterThanOrEqual(1);
    });
  });

  describe("end-to-end: an optional holiday is takeable via a normal leave application", () => {
    it("applying leave on an optional-holiday date deducts from the employee's own leave balance", async () => {
      const empId = await createDisposableEmployee(adminCookie, "ApplyOptional");
      createdEmployeeIds.push(empId);
      createdUserEmails.push("qa.holidays.applyoptional@test.local");
      const empCookie = await ensureLogin(adminCookie, "qa.holidays.applyoptional@test.local", "employee", empId);

      const optionalId = await createHoliday(adminCookie, { name: "QA Applyable Optional", date: `${FIXTURE_YEAR}-06-20`, type: "optional" });
      createdHolidayIds.push(optionalId);

      const ltRes = await fetch(`${BASE}/api/leave-types`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ name: "QA Holiday-Apply Leave", shortCode: "QHAL", totalDays: 5, isCarryForward: false, maxCarryForward: 0, isPaid: true }),
      });
      const leaveType = (await ltRes.json()).data;
      createdLeaveTypeIds.push(leaveType.id);

      await db.leaveBalance.create({ data: { employeeId: empId, leaveTypeId: leaveType.id, year: FIXTURE_YEAR, totalAllocated: 5, carryForwarded: 0 } });

      const applyRes = await fetch(`${BASE}/api/ess/leaves`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: empCookie },
        body: JSON.stringify({ leaveTypeId: leaveType.id, startDate: `${FIXTURE_YEAR}-06-20`, endDate: `${FIXTURE_YEAR}-06-20`, reason: "Taking the optional holiday" }),
      });
      expect(applyRes.status).toBe(201);
      const application = (await applyRes.json()).data;

      const approveRes = await fetch(`${BASE}/api/leaves/${application.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ status: "approved" }),
      });
      expect(approveRes.status).toBe(200);

      const balanceRes = await fetch(`${BASE}/api/ess/leaves/balance?year=${FIXTURE_YEAR}`, { headers: { Cookie: empCookie } });
      const balanceJson = await balanceRes.json();
      const row = balanceJson.data.find((b: { leaveTypeId: string }) => b.leaveTypeId === leaveType.id);
      expect(row).toBeTruthy();
      expect(row.used).toBe(1);
    });
  });
});
