// Integration tests for the Holiday Calendar overhaul: year vs financial-year filtering on
// GET /api/holidays, category/type persistence, DELETE cascading OptionalHolidayPick cleanly,
// the new /api/ess/optional-holidays quota-enforced pick/unpick endpoint, and — the critical
// regression guard — that an employee's Restricted/Optional holiday pick changes what payroll
// actually pays them for, while every existing mandatory holiday stays completely unaffected.
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
  let managerCookie: string;
  let originalQuota: number;
  const createdHolidayIds: string[] = [];
  const createdEmployeeIds: string[] = [];
  const createdUserEmails: string[] = [];

  beforeAll(async () => {
    adminCookie = await login("admin@payrollpro.local", "Admin@12345");
    createdUserEmails.push("qa.holidays.manager@test.local");
    managerCookie = await ensureLogin(adminCookie, "qa.holidays.manager@test.local", "manager");

    const settingsRes = await fetch(`${BASE}/api/settings`, { headers: { Cookie: adminCookie } });
    const settings = await settingsRes.json();
    originalQuota = settings.data.optionalHolidayQuota ?? 0;

    // A quota of 1 makes the enforcement test (second pick must 409) unambiguous.
    const quotaRes = await fetch(`${BASE}/api/settings`, {
      method: "PUT", headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ optionalHolidayQuota: 1 }),
    });
    if (!quotaRes.ok) throw new Error(`Failed to set test quota: ${quotaRes.status} ${await quotaRes.text()}`);
  });

  afterAll(async () => {
    // Restore the real quota — must never leave this changed just because a test ran.
    await fetch(`${BASE}/api/settings`, {
      method: "PUT", headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ optionalHolidayQuota: originalQuota }),
    });

    const runs = await db.payrollRun.findMany({ where: { year: FIXTURE_YEAR, runType: "regular" } });
    const runIds = runs.map((r) => r.id);
    if (runIds.length) {
      await db.payrollDetail.deleteMany({ where: { payrollRunId: { in: runIds } } });
      await db.payrollRun.deleteMany({ where: { id: { in: runIds } } });
    }
    if (createdEmployeeIds.length) {
      await db.optionalHolidayPick.deleteMany({ where: { employeeId: { in: createdEmployeeIds } } });
    }
    if (createdHolidayIds.length) {
      await db.optionalHolidayPick.deleteMany({ where: { holidayId: { in: createdHolidayIds } } });
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

  describe("DELETE /api/holidays/[id] cascades OptionalHolidayPick cleanly", () => {
    it("deletes without an FK error even when a pick exists, and the pick is gone too", async () => {
      const empId = await createDisposableEmployee(adminCookie, "Cascade");
      createdEmployeeIds.push(empId);
      createdUserEmails.push("qa.holidays.cascade@test.local");
      const empCookie = await ensureLogin(adminCookie, "qa.holidays.cascade@test.local", "employee", empId);

      const holidayId = await createHoliday(adminCookie, { name: "QA Cascade Holiday", date: `${FIXTURE_YEAR}-03-10`, type: "optional" });
      // Registered for cleanup immediately (not just relied on via the in-test DELETE below) so a
      // test failure partway through this test still can't leave an orphaned row that blocks a
      // retry with a unique-date conflict.
      createdHolidayIds.push(holidayId);

      const pickRes = await fetch(`${BASE}/api/ess/optional-holidays`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: empCookie },
        body: JSON.stringify({ holidayId, choose: true }),
      });
      expect(pickRes.status).toBe(201);
      expect(await db.optionalHolidayPick.count({ where: { holidayId } })).toBe(1);

      const deleteRes = await fetch(`${BASE}/api/holidays/${holidayId}`, { method: "DELETE", headers: { Cookie: adminCookie } });
      expect(deleteRes.status).toBe(200);
      expect(await db.optionalHolidayPick.count({ where: { holidayId } })).toBe(0);
    });
  });

  describe("POST /api/ess/optional-holidays validation and quota enforcement", () => {
    it("rejects picking a mandatory-type holiday", async () => {
      const empId = await createDisposableEmployee(adminCookie, "Mandatory");
      createdEmployeeIds.push(empId);
      createdUserEmails.push("qa.holidays.mandatory@test.local");
      const empCookie = await ensureLogin(adminCookie, "qa.holidays.mandatory@test.local", "employee", empId);

      const holidayId = await createHoliday(adminCookie, { name: "QA Mandatory Holiday", date: `${FIXTURE_YEAR}-04-10`, type: "holiday" });
      createdHolidayIds.push(holidayId);

      const res = await fetch(`${BASE}/api/ess/optional-holidays`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: empCookie },
        body: JSON.stringify({ holidayId, choose: true }),
      });
      expect(res.status).toBe(400);
    });

    it("enforces the quota (409 past the limit) and supports a full pick/unpick round trip", async () => {
      const empId = await createDisposableEmployee(adminCookie, "Quota");
      createdEmployeeIds.push(empId);
      createdUserEmails.push("qa.holidays.quota@test.local");
      const empCookie = await ensureLogin(adminCookie, "qa.holidays.quota@test.local", "employee", empId);

      const holidayA = await createHoliday(adminCookie, { name: "QA Optional A", date: `${FIXTURE_YEAR}-06-11`, type: "optional" });
      const holidayB = await createHoliday(adminCookie, { name: "QA Optional B", date: `${FIXTURE_YEAR}-06-12`, type: "optional" });
      createdHolidayIds.push(holidayA, holidayB);

      // Quota is 1 (set in beforeAll) — picking A succeeds, picking B on top of it must 409.
      const pickA = await fetch(`${BASE}/api/ess/optional-holidays`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: empCookie },
        body: JSON.stringify({ holidayId: holidayA, choose: true }),
      });
      expect(pickA.status).toBe(201);

      const pickBOverQuota = await fetch(`${BASE}/api/ess/optional-holidays`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: empCookie },
        body: JSON.stringify({ holidayId: holidayB, choose: true }),
      });
      expect(pickBOverQuota.status).toBe(409);

      const listAfterA = await fetch(`${BASE}/api/ess/optional-holidays?year=${FIXTURE_YEAR}`, { headers: { Cookie: empCookie } });
      const listAfterAJson = await listAfterA.json();
      expect(listAfterAJson.chosenCount).toBe(1);
      expect(listAfterAJson.quota).toBe(1);
      expect(listAfterAJson.data.find((h: { id: string }) => h.id === holidayA).chosenByMe).toBe(true);

      // Unpick A, then B should now succeed — proving the round trip actually frees up the quota.
      const unpickA = await fetch(`${BASE}/api/ess/optional-holidays`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: empCookie },
        body: JSON.stringify({ holidayId: holidayA, choose: false }),
      });
      expect(unpickA.status).toBe(200);

      const pickBAfterUnpick = await fetch(`${BASE}/api/ess/optional-holidays`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: empCookie },
        body: JSON.stringify({ holidayId: holidayB, choose: true }),
      });
      expect(pickBAfterUnpick.status).toBe(201);

      const listFinal = await fetch(`${BASE}/api/ess/optional-holidays?year=${FIXTURE_YEAR}`, { headers: { Cookie: empCookie } });
      const listFinalJson = await listFinal.json();
      expect(listFinalJson.data.find((h: { id: string }) => h.id === holidayA).chosenByMe).toBe(false);
      expect(listFinalJson.data.find((h: { id: string }) => h.id === holidayB).chosenByMe).toBe(true);
    });

    it("manager role has no employeeId and is blocked", async () => {
      const res = await fetch(`${BASE}/api/ess/optional-holidays?year=${FIXTURE_YEAR}`, { headers: { Cookie: managerCookie } });
      expect(res.status).toBe(403);
    });
  });

  describe("payroll cross-check — the critical regression guard", () => {
    it("presentDays differs by exactly one day between an employee who chose the optional holiday and one who didn't", async () => {
      const payMonth = 5; // May FIXTURE_YEAR — a fresh month untouched by other tests in this file
      const empChosenId = await createDisposableEmployee(adminCookie, "Chosen");
      const empNotChosenId = await createDisposableEmployee(adminCookie, "NotChosen");
      createdEmployeeIds.push(empChosenId, empNotChosenId);
      createdUserEmails.push("qa.holidays.chosen@test.local", "qa.holidays.notchosen@test.local");
      const empChosenCookie = await ensureLogin(adminCookie, "qa.holidays.chosen@test.local", "employee", empChosenId);
      await ensureLogin(adminCookie, "qa.holidays.notchosen@test.local", "employee", empNotChosenId);

      // One mandatory holiday (credits both employees, unchanged behavior) and one optional
      // holiday (only credits whichever employee actually chose it).
      const mandatoryId = await createHoliday(adminCookie, { name: "QA Payroll Mandatory", date: `${FIXTURE_YEAR}-05-05`, type: "holiday" });
      const optionalId = await createHoliday(adminCookie, { name: "QA Payroll Optional", date: `${FIXTURE_YEAR}-05-15`, type: "optional" });
      createdHolidayIds.push(mandatoryId, optionalId);

      const pickRes = await fetch(`${BASE}/api/ess/optional-holidays`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: empChosenCookie },
        body: JSON.stringify({ holidayId: optionalId, choose: true }),
      });
      expect(pickRes.status).toBe(201);

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
      const chosenRow = runDetail.details.find((d: { employeeId: string }) => d.employeeId === empChosenId);
      const notChosenRow = runDetail.details.find((d: { employeeId: string }) => d.employeeId === empNotChosenId);
      expect(chosenRow).toBeTruthy();
      expect(notChosenRow).toBeTruthy();

      expect(chosenRow.presentDays).toBe(notChosenRow.presentDays + 1);
    });
  });
});
