// Integration tests for the Reports enhancements: new headcount/attrition report types,
// multi-month date-range aggregation for the existing statutory types, xlsx export, and the
// trends endpoint. Hits a REAL running server (`npm run dev` on localhost:3000) with a REAL
// database — not mocked. Excluded from the default `npm test` run (see
// vitest.integration.config.ts).
// Run manually with the dev server up:
// `npx vitest run --config vitest.integration.config.ts src/__tests__/reports.integration.test.ts`
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import ExcelJS from "exceljs";
import { db } from "@/lib/db";

const BASE = "http://localhost:3000";
// A dedicated fixture slot for this suite's disposable payroll runs — distinct from the 2100
// slot other integration suites use, but within reportQuerySchema's year bound (max 2100).
const FIXTURE_YEAR = 2099;

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
  const password = "TestReports@12345";
  const res = await fetch(`${BASE}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ email, password, name: "QA Reports", role, employeeId }),
  });
  if (res.status !== 201 && res.status !== 409) {
    throw new Error(`Failed to create/reuse ${role} login ${email}: ${res.status} ${await res.text()}`);
  }
  return login(email, password);
}

describe("Reports enhancements (requires live dev server)", () => {
  let adminCookie: string;
  let managerCookie: string;
  let employeeCookie: string;
  let payrollEmployeeId: string;
  const createdEmployeeIds: string[] = [];
  const createdInviteIds: string[] = [];

  beforeAll(async () => {
    adminCookie = await login("admin@payrollpro.local", "Admin@12345");
    managerCookie = await ensureLogin(adminCookie, "qa.reports.manager@test.local", "manager");

    const empRes = await fetch(`${BASE}/api/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        firstName: "QA", lastName: "Reports", email: `qa.reports.emp.${Date.now()}@test.local`,
        designation: "QA Engineer", department: "Quality", dateOfJoining: "2020-01-01",
        pfApplicable: true,
        salaryStructure: { basic: 20000, houseRentAllowance: 8000, specialAllowance: 2000 },
      }),
    });
    if (!empRes.ok) throw new Error(`Failed to create payroll test employee: ${empRes.status} ${await empRes.text()}`);
    const emp = await empRes.json();
    payrollEmployeeId = emp.id;
    createdEmployeeIds.push(payrollEmployeeId);

    employeeCookie = await ensureLogin(adminCookie, "qa.reports.employee@test.local", "employee", payrollEmployeeId);

    // Two disposable processed months for the multi-month aggregation test.
    for (const month of [1, 2]) {
      const res = await fetch(`${BASE}/api/payroll`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ month, year: FIXTURE_YEAR }),
      });
      if (![200, 409].includes(res.status)) throw new Error(`Failed to process payroll ${month}/${FIXTURE_YEAR}: ${res.status} ${await res.text()}`);
    }
  });

  afterAll(async () => {
    const runs = await db.payrollRun.findMany({ where: { year: FIXTURE_YEAR, runType: "regular" } });
    const runIds = runs.map((r) => r.id);
    if (runIds.length) {
      await db.payrollDetail.deleteMany({ where: { payrollRunId: { in: runIds } } });
      await db.payrollRun.deleteMany({ where: { id: { in: runIds } } });
    }
    if (createdInviteIds.length) await db.onboardingInvite.deleteMany({ where: { id: { in: createdInviteIds } } });
    // Users must go before Employees — User.employeeId is a foreign key into Employee.
    await db.user.deleteMany({ where: { email: { in: ["qa.reports.manager@test.local", "qa.reports.employee@test.local"] } } });
    if (createdEmployeeIds.length) {
      await db.exitRequest.deleteMany({ where: { employeeId: { in: createdEmployeeIds } } });
      await db.salaryStructure.deleteMany({ where: { employeeId: { in: createdEmployeeIds } } });
      await db.employee.deleteMany({ where: { id: { in: createdEmployeeIds } } });
    }
    await db.$disconnect();
  });

  describe("role gating", () => {
    it("employee is blocked, manager is allowed, for both statutory and workforce types", async () => {
      for (const type of ["summary", "headcount", "attrition"]) {
        const qs = type === "attrition" ? `type=attrition&fromDate=2026-01-01&toDate=2026-01-31` : type === "headcount" ? `type=headcount` : `type=summary&month=1&year=${FIXTURE_YEAR}`;
        const asEmployee = await fetch(`${BASE}/api/reports?${qs}`, { headers: { Cookie: employeeCookie } });
        expect(asEmployee.status, type).toBe(403);
        const asManager = await fetch(`${BASE}/api/reports?${qs}`, { headers: { Cookie: managerCookie } });
        expect(asManager.status, type).toBe(200);
      }
    });
  });

  describe("headcount report", () => {
    it("reflects the same active-employee definition as Dashboard, and excludes onboarding-status employees", async () => {
      const before = await fetch(`${BASE}/api/reports?type=headcount`, { headers: { Cookie: adminCookie } });
      const beforeData = (await before.json()).data;
      const dashboardRes = await fetch(`${BASE}/api/dashboard`, { headers: { Cookie: adminCookie } });
      const dashboardData = await dashboardRes.json();
      expect(beforeData.totalActiveEmployees).toBe(dashboardData.totalEmployees);

      // The already-created payroll test employee (active) should be counted.
      const qualityDept = beforeData.byDepartment.find((d: { department: string }) => d.department === "Quality");
      expect(qualityDept).toBeTruthy();

      // An onboarding-status employee (created via an invite, never approved) must be excluded.
      const inviteRes = await fetch(`${BASE}/api/onboarding-invites`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({
          firstName: "QA", lastName: "Onboarding", email: `qa.reports.onboarding.${Date.now()}@test.local`,
          designation: "QA", department: "Quality", dateOfJoining: "2026-01-01",
        }),
      });
      const invite = await inviteRes.json();
      createdInviteIds.push(invite.data.invite.id);
      createdEmployeeIds.push(invite.data.employee.id);

      const after = await fetch(`${BASE}/api/reports?type=headcount`, { headers: { Cookie: adminCookie } });
      const afterData = (await after.json()).data;
      expect(afterData.totalActiveEmployees).toBe(beforeData.totalActiveEmployees);
    });
  });

  describe("attrition report", () => {
    it("includes an employee whose exit falls inside the range, excludes one outside it", async () => {
      const exitEmpRes = await fetch(`${BASE}/api/employees`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({
          firstName: "QA", lastName: "Exited", email: `qa.reports.exited.${Date.now()}@test.local`,
          designation: "QA", department: "Quality", dateOfJoining: "2020-01-01",
        }),
      });
      const exitEmp = await exitEmpRes.json();
      createdEmployeeIds.push(exitEmp.id);

      await fetch(`${BASE}/api/employees/${exitEmp.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ dateOfExit: "2026-03-15" }),
      });

      const insideRes = await fetch(`${BASE}/api/reports?type=attrition&fromDate=2026-03-01&toDate=2026-03-31`, { headers: { Cookie: adminCookie } });
      const insideData = (await insideRes.json()).data;
      const found = insideData.employees.find((e: { employeeId: string }) => e.employeeId === exitEmp.id);
      expect(found).toBeTruthy();
      expect(found.tenureDays).toBeGreaterThan(0);

      const outsideRes = await fetch(`${BASE}/api/reports?type=attrition&fromDate=2026-04-01&toDate=2026-04-30`, { headers: { Cookie: adminCookie } });
      const outsideData = (await outsideRes.json()).data;
      expect(outsideData.employees.find((e: { employeeId: string }) => e.employeeId === exitEmp.id)).toBeUndefined();
    });
  });

  describe("multi-month statutory aggregation", () => {
    it("sums PF across a range while leaving each individual single-month call unchanged", async () => {
      const jan = await fetch(`${BASE}/api/reports?type=pf&month=1&year=${FIXTURE_YEAR}`, { headers: { Cookie: adminCookie } });
      const janData = (await jan.json()).data;
      const janRow = janData.employees.find((e: { employeeId: string }) => e.employeeId === payrollEmployeeId);
      expect(janRow).toBeTruthy();

      const feb = await fetch(`${BASE}/api/reports?type=pf&month=2&year=${FIXTURE_YEAR}`, { headers: { Cookie: adminCookie } });
      const febData = (await feb.json()).data;
      const febRow = febData.employees.find((e: { employeeId: string }) => e.employeeId === payrollEmployeeId);
      expect(febRow).toBeTruthy();

      const rangeRes = await fetch(`${BASE}/api/reports?type=pf&fromMonth=1&fromYear=${FIXTURE_YEAR}&toMonth=2&toYear=${FIXTURE_YEAR}`, { headers: { Cookie: adminCookie } });
      expect(rangeRes.status).toBe(200);
      const rangeData = (await rangeRes.json()).data;
      expect(rangeData.isRange).toBe(true);
      expect(rangeData.monthsIncluded).toEqual([{ month: 1, year: FIXTURE_YEAR }, { month: 2, year: FIXTURE_YEAR }]);
      const rangeRow = rangeData.employees.find((e: { employeeId: string }) => e.employeeId === payrollEmployeeId);
      expect(rangeRow).toBeTruthy();
      expect(rangeRow.employeePF).toBeCloseTo(janRow.employeePF + febRow.employeePF, 5);

      // Backward-compat regression guard: re-fetching a single month is unaffected by the range query above.
      const janAgain = await fetch(`${BASE}/api/reports?type=pf&month=1&year=${FIXTURE_YEAR}`, { headers: { Cookie: adminCookie } });
      const janAgainData = (await janAgain.json()).data;
      expect(janAgainData.isRange).toBe(false);
      const janAgainRow = janAgainData.employees.find((e: { employeeId: string }) => e.employeeId === payrollEmployeeId);
      expect(janAgainRow.employeePF).toBeCloseTo(janRow.employeePF, 5);
    });

    it("rejects a reversed range and an out-of-bounds range", async () => {
      const reversed = await fetch(`${BASE}/api/reports?type=pf&fromMonth=6&fromYear=${FIXTURE_YEAR}&toMonth=1&toYear=${FIXTURE_YEAR}`, { headers: { Cookie: adminCookie } });
      expect(reversed.status).toBe(400);

      const tooLong = await fetch(`${BASE}/api/reports?type=pf&fromMonth=1&fromYear=2000&toMonth=1&toYear=2100`, { headers: { Cookie: adminCookie } });
      expect(tooLong.status).toBe(400);
    });
  });

  describe("xlsx export", () => {
    it("returns a real, parseable workbook with correct headers", async () => {
      const res = await fetch(`${BASE}/api/reports?type=summary&month=1&year=${FIXTURE_YEAR}&format=xlsx`, { headers: { Cookie: adminCookie } });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("spreadsheetml");
      const arrayBuffer = await res.arrayBuffer();
      expect(arrayBuffer.byteLength).toBeGreaterThan(500);

      const workbook = new ExcelJS.Workbook();
      // exceljs's Buffer generic type doesn't line up with this project's Node type version;
      // a runtime Buffer is correct here regardless.
      await workbook.xlsx.load(Buffer.from(arrayBuffer) as any);
      const sheet = workbook.worksheets[0];
      const headerRow = sheet.getRow(1).values as unknown[];
      expect(headerRow).toContain("metric");
      expect(headerRow).toContain("value");
    });

    it("headcount and attrition also export as xlsx", async () => {
      const headcountRes = await fetch(`${BASE}/api/reports?type=headcount&format=xlsx`, { headers: { Cookie: adminCookie } });
      expect(headcountRes.status).toBe(200);
      expect(headcountRes.headers.get("content-type")).toContain("spreadsheetml");

      const attritionRes = await fetch(`${BASE}/api/reports?type=attrition&fromDate=2026-01-01&toDate=2026-12-31&format=xlsx`, { headers: { Cookie: adminCookie } });
      expect(attritionRes.status).toBe(200);
      expect(attritionRes.headers.get("content-type")).toContain("spreadsheetml");
    });
  });

  describe("PT/LWF CSV export (regression guard for the newly-added UI export buttons)", () => {
    it("both still return valid CSV", async () => {
      const ptRes = await fetch(`${BASE}/api/reports?type=pt&month=1&year=${FIXTURE_YEAR}&format=csv`, { headers: { Cookie: adminCookie } });
      expect(ptRes.status).toBe(200);
      expect(ptRes.headers.get("content-type")).toContain("text/csv");

      const lwfRes = await fetch(`${BASE}/api/reports?type=lwf&month=1&year=${FIXTURE_YEAR}&format=csv`, { headers: { Cookie: adminCookie } });
      expect(lwfRes.status).toBe(200);
      expect(lwfRes.headers.get("content-type")).toContain("text/csv");
    });
  });

  describe("trends endpoint", () => {
    it("returns a bounded, chronologically ordered series", async () => {
      const res = await fetch(`${BASE}/api/reports/trends?months=3`, { headers: { Cookie: adminCookie } });
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.months.length).toBeLessThanOrEqual(3);
      for (const m of data.months) {
        expect(typeof m.exits).toBe("number");
        expect(typeof m.grossPayroll).toBe("number");
        expect(typeof m.netPayroll).toBe("number");
      }
      for (let i = 1; i < data.months.length; i++) {
        const prev = data.months[i - 1];
        const cur = data.months[i];
        expect(cur.year * 12 + cur.month).toBeGreaterThan(prev.year * 12 + prev.month);
      }
    });

    it("employee role is blocked", async () => {
      const res = await fetch(`${BASE}/api/reports/trends`, { headers: { Cookie: employeeCookie } });
      expect(res.status).toBe(403);
    });
  });
});
