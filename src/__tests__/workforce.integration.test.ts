// Integration tests for the Contractor Workforce foundation (clients, projects, assignments,
// feature flags, coordinator/contractor scoping). Like the other *.integration.test.ts files these
// hit a REAL running server (`npm run dev` on localhost:3000) with a REAL, seeded database — never
// mocks — and are excluded from the default `npm test` run.
// Run: npx vitest run --config vitest.integration.config.ts src/__tests__/workforce.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const BASE = "http://localhost:3000";
const RUN = Date.now().toString(36); // keeps re-runs from colliding on unique names

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

async function call(method: string, path: string, cookie?: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function employeeId(adminCookie: string, code: string): Promise<string> {
  const { json } = await call("GET", `/api/employees?search=${code}`, adminCookie);
  const emp = json.data.find((e: { employeeCode: string }) => e.employeeCode === code) ?? json.data[0];
  if (!emp) throw new Error(`Seeded employee ${code} not found — is the DB seeded?`);
  return emp.id;
}

async function ensureUser(adminCookie: string, email: string, role: string, name: string, linkedEmployeeId?: string) {
  const password = "TestUser@12345";
  const res = await call("POST", "/api/users", adminCookie, { email, password, name, role, ...(linkedEmployeeId ? { employeeId: linkedEmployeeId } : {}) });
  if (res.status !== 201 && res.status !== 409) throw new Error(`Failed to create ${email}: ${res.status} ${JSON.stringify(res.json)}`);
  return login(email, password);
}

async function userId(adminCookie: string, email: string): Promise<string> {
  const { json } = await call("GET", "/api/users", adminCookie);
  return json.data.find((u: { email: string }) => u.email === email).id;
}


/** Creates a fresh contractor Employee, so these tests never collide with logins other suites attach to the seeded staff. */
let contractorSeq = 0;
async function createContractor(admin: string, tag: string): Promise<string> {
  contractorSeq++;
  const unique = RUN + tag + contractorSeq;
  const r = await call("POST", "/api/employees", admin, {
    firstName: "QA" + tag, lastName: "Contractor " + unique, email: "qa.wf." + unique + "@test.local", phone: "90000" + String(Math.floor(Math.random() * 90000) + 10000),
    dateOfJoining: "2026-01-01", designation: "QA Contractor", department: "QA", employmentType: "contractor",
    salaryStructure: { basic: 0, houseRentAllowance: 0, specialAllowance: 0 },
  });
  const id = r.json?.data?.id ?? r.json?.id;
  if (r.status !== 201 || !id) throw new Error("could not create a test contractor: " + r.status + " " + JSON.stringify(r.json));
  return id as string;
}

describe("Contractor workforce foundation (requires live dev server)", () => {
  let admin: string, hr: string, manager: string, otherManager: string, contractor: string, otherContractor: string;
  let contractorEmpId: string, otherEmpId: string, managerUserId: string, contractorUserId: string;
  let clientId: string, projectId: string, assignmentId: string;

  beforeAll(async () => {
    admin = await login("admin@payrollpro.local", "Admin@12345");
    hr = await login("hr@payrollpro.local", "HrManager@12345");
    manager = await login("manager@payrollpro.local", "Manager@12345");
    contractorEmpId = await createContractor(admin, "A");
    otherEmpId = await createContractor(admin, "B");
    otherManager = await ensureUser(admin, "qa.wf.manager2@test.local", "manager", "QA Manager Two");
    contractor = await ensureUser(admin, `qa.wf.contractor1.${RUN}@test.local`, "employee", "QA Contractor One", contractorEmpId);
    otherContractor = await ensureUser(admin, `qa.wf.contractor2.${RUN}@test.local`, "employee", "QA Contractor Two", otherEmpId);
    managerUserId = await userId(admin, "manager@payrollpro.local");
    contractorUserId = await userId(admin, `qa.wf.contractor1.${RUN}@test.local`);
    // Re-runnable: end any live assignment left on this contractor by a previous run, otherwise
    // the exclusivity rule would (correctly) block creating a fresh one.
    const leftovers = await call("GET", `/api/assignments?employeeId=${contractorEmpId}`, admin);
    for (const a of leftovers.json.data as { id: string; status: string }[]) {
      if (a.status !== "ended") await call("PUT", `/api/assignments/${a.id}`, admin, { status: "ended" });
    }
    // Start every run with the module switched OFF at company level.
    await call("PUT", "/api/workforce/flags", admin, { key: "contractor_workforce_enabled", scope: "company", enabled: false });
  });

  afterAll(async () => {
    await call("PUT", "/api/workforce/flags", admin, { key: "contractor_workforce_enabled", scope: "company", enabled: false });
  });

  it("requires a login for every new route", async () => {
    for (const path of ["/api/clients", "/api/projects", "/api/assignments", "/api/workforce/flags"]) {
      expect((await call("GET", path)).status).toBe(401);
    }
  });

  it("only admin/hr can create clients; contractors and coordinators are forbidden", async () => {
    expect((await call("POST", "/api/clients", manager, { name: `Nope ${RUN}` })).status).toBe(403);
    expect((await call("POST", "/api/clients", contractor, { name: `Nope ${RUN}` })).status).toBe(403);
    expect((await call("GET", "/api/clients", contractor)).status).toBe(403); // contractors never list clients
  });

  it("creates a client with a sequential code and rejects a duplicate under a different spelling", async () => {
    const created = await call("POST", "/api/clients", hr, { name: `QA Acme ${RUN} Pvt. Ltd.` });
    expect(created.status).toBe(201);
    expect(created.json.data.code).toMatch(/^CL-\d{3,}$/);
    clientId = created.json.data.id;

    const dup = await call("POST", "/api/clients", admin, { name: `qa acme ${RUN} private limited` });
    expect(dup.status).toBe(409);
  });

  it("creates a project, a contact and a client holiday (rejecting duplicates)", async () => {
    const project = await call("POST", "/api/projects", admin, { clientId, name: `Pilot Project ${RUN}`, workMode: "remote" });
    expect(project.status).toBe(201);
    projectId = project.json.data.id;
    expect((await call("POST", "/api/projects", admin, { clientId, name: `Pilot Project ${RUN}` })).status).toBe(409);

    const contact = await call("POST", `/api/clients/${clientId}/contacts`, admin, { name: "Priya Rep", phone: "9876543210", kind: "representative" });
    expect(contact.status).toBe(201);
    expect((await call("POST", `/api/clients/${clientId}/contacts`, admin, { name: "No Way To Reach" })).status).toBe(400);

    const holiday = await call("POST", `/api/clients/${clientId}/holidays`, admin, { date: "2026-11-12", name: "Client Diwali" });
    expect(holiday.status).toBe(201);
    expect((await call("POST", `/api/clients/${clientId}/holidays`, admin, { date: "2026-11-12", name: "Again" })).status).toBe(409);

    const list = await call("GET", `/api/clients/${clientId}/holidays?year=2026`, admin);
    expect(list.json.data.some((h: { name: string }) => h.name === "Client Diwali")).toBe(true);

    // A contact can't be edited through another client's URL.
    const other = await call("POST", "/api/clients", admin, { name: `QA Other ${RUN}` });
    const wrongPath = await call("PUT", `/api/clients/${other.json.data.id}/contacts/${contact.json.data.id}`, admin, { name: "Hijack" });
    expect(wrongPath.status).toBe(404);
  });

  it("validates assignments: pay rate to go active, staff-only coordinators, dates", async () => {
    const base = { employeeId: contractorEmpId, projectId, startDate: "2026-11-01" };
    expect((await call("POST", "/api/assignments", admin, { ...base, status: "active" })).status).toBe(400); // no pay rate
    expect((await call("POST", "/api/assignments", admin, { ...base, resourceCoordinatorId: contractorUserId })).status).toBe(400); // contractor login as coordinator
    expect((await call("POST", "/api/assignments", admin, { ...base, endDate: "2026-10-01" })).status).toBe(400);
    expect((await call("POST", "/api/assignments", admin, { ...base, workingDays: "1,1,2" })).status).toBe(400);
    expect((await call("POST", "/api/assignments", manager, base)).status).toBe(403);
  });

  it("creates an assignment with a coordinator, then blocks an overlapping exclusive one", async () => {
    const created = await call("POST", "/api/assignments", admin, {
      employeeId: contractorEmpId, projectId, startDate: "2026-11-01",
      resourceCoordinatorId: managerUserId, payType: "monthly", payRate: 60000, monthlyDayBasis: "working", status: "active",
    });
    expect(created.status).toBe(201);
    assignmentId = created.json.data.id;

    const overlap = await call("POST", "/api/assignments", admin, { employeeId: contractorEmpId, projectId, startDate: "2026-12-01" });
    expect(overlap.status).toBe(409);
  });

  it("with the module OFF, coordinators and contractors see nothing; admin/hr still do", async () => {
    expect((await call("GET", "/api/assignments", manager)).json.data).toEqual([]);
    expect((await call("GET", "/api/assignments", contractor)).json.data).toEqual([]);
    expect((await call("GET", `/api/assignments/${assignmentId}`, manager)).status).toBe(404);
    expect((await call("GET", "/api/clients", manager)).json.data).toEqual([]);
    expect((await call("GET", `/api/clients/${clientId}`, manager)).status).toBe(404);
    const adminList = await call("GET", "/api/assignments", admin);
    expect(adminList.json.data.some((a: { id: string }) => a.id === assignmentId)).toBe(true);
  });

  it("only an admin can switch the module on (hr, manager and contractor cannot)", async () => {
    const flag = { key: "contractor_workforce_enabled", scope: "company", enabled: true };
    expect((await call("PUT", "/api/workforce/flags", hr, flag)).status).toBe(403);
    expect((await call("PUT", "/api/workforce/flags", manager, flag)).status).toBe(403);
    expect((await call("PUT", "/api/workforce/flags", contractor, flag)).status).toBe(403);
    expect((await call("PUT", "/api/workforce/flags", admin, flag)).status).toBe(200);
    expect((await call("PUT", "/api/workforce/flags", admin, { key: "not_a_flag", scope: "company", enabled: true })).status).toBe(400);
    expect((await call("PUT", "/api/workforce/flags", admin, { key: "whatsapp_enabled", scope: "project", enabled: true })).status).toBe(400); // scopeId missing
  });

  it("with the module ON, a coordinator sees only their own assignment and never pay terms", async () => {
    const mine = await call("GET", "/api/assignments", manager);
    expect(mine.json.data).toHaveLength(1);
    expect(mine.json.data[0].id).toBe(assignmentId);
    expect("payRate" in mine.json.data[0]).toBe(false);
    expect("payType" in mine.json.data[0]).toBe(false);

    expect((await call("GET", `/api/clients/${clientId}`, manager)).status).toBe(200);
    expect((await call("GET", `/api/clients/${clientId}/holidays`, manager)).status).toBe(200);
    expect((await call("GET", `/api/projects/${projectId}`, manager)).status).toBe(200);
    // ...but cannot change anything.
    expect((await call("PUT", `/api/assignments/${assignmentId}`, manager, { payRate: 1 })).status).toBe(403);
    expect((await call("PUT", `/api/clients/${clientId}`, manager, { name: "Hacked" })).status).toBe(403);
    expect((await call("POST", `/api/clients/${clientId}/holidays`, manager, { date: "2026-11-13", name: "x" })).status).toBe(403);
  });

  it("an unassigned coordinator sees none of it (404, not 403)", async () => {
    expect((await call("GET", "/api/assignments", otherManager)).json.data).toEqual([]);
    expect((await call("GET", `/api/assignments/${assignmentId}`, otherManager)).status).toBe(404);
    expect((await call("GET", `/api/clients/${clientId}`, otherManager)).status).toBe(404);
    expect((await call("GET", `/api/clients/${clientId}/contacts`, otherManager)).status).toBe(404);
    expect((await call("GET", `/api/projects/${projectId}`, otherManager)).status).toBe(404);
    expect((await call("GET", "/api/clients", otherManager)).json.data).toEqual([]);
  });

  it("a contractor sees only their own assignment (no pay terms); another contractor sees nothing", async () => {
    const own = await call("GET", "/api/assignments", contractor);
    expect(own.json.data).toHaveLength(1);
    expect(own.json.data[0].employeeId).toBe(contractorEmpId);
    expect("payRate" in own.json.data[0]).toBe(false);

    expect((await call("GET", "/api/assignments", otherContractor)).json.data).toEqual([]);
    expect((await call("GET", `/api/assignments/${assignmentId}`, otherContractor)).status).toBe(404);
    // A client-supplied employeeId filter cannot widen a contractor's view.
    const widened = await call("GET", `/api/assignments?employeeId=${contractorEmpId}`, otherContractor);
    expect(widened.json.data).toEqual([]);
  });

  it("admin/hr see pay terms and a pay-term change is audited", async () => {
    const view = await call("GET", `/api/assignments/${assignmentId}`, hr);
    expect(view.json.data.payRate).toBe(60000);
    const upd = await call("PUT", `/api/assignments/${assignmentId}`, admin, { payRate: 65000, monthlyDayBasis: "calendar" });
    expect(upd.status).toBe(200);
    expect(upd.json.data.payRate).toBe(65000);
    const audit = await call("GET", "/api/audit-log?entity=Assignment", admin);
    expect(audit.status).toBe(200);
  });

  it("a project-level flag can enable the module for one project only", async () => {
    await call("PUT", "/api/workforce/flags", admin, { key: "contractor_workforce_enabled", scope: "company", enabled: false });
    expect((await call("GET", "/api/assignments", manager)).json.data).toEqual([]);
    expect((await call("PUT", "/api/workforce/flags", admin, { key: "contractor_workforce_enabled", scope: "project", scopeId: projectId, enabled: true })).status).toBe(200);
    expect((await call("GET", "/api/assignments", manager)).json.data).toHaveLength(1);
    // ...and switching it off at project level wins even if the company turns it on.
    await call("PUT", "/api/workforce/flags", admin, { key: "contractor_workforce_enabled", scope: "company", enabled: true });
    await call("PUT", "/api/workforce/flags", admin, { key: "contractor_workforce_enabled", scope: "project", scopeId: projectId, enabled: false });
    expect((await call("GET", "/api/assignments", manager)).json.data).toEqual([]);
  });
});
