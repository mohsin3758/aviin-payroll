// End-to-end integration test of the Contractor Workforce daily loop and month-end flow, against a
// REAL running server with a REAL, seeded database (never mocks; excluded from `npm test`).
//  - The automation clock is driven through POST /api/workforce/tick { now } (allowed outside production).
//  - WhatsApp is deliberately NOT enabled, so nothing is sent to anyone: messages are recorded as
//    "suppressed", which is exactly what the safety design promises.
// Run (dev server up, scratch DB seeded, DATABASE_URL pointing at the same DB):
//   npx vitest run --config vitest.integration.config.ts src/__tests__/workforce-flow.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHmac } from "crypto";
import { signButtonPayload } from "@/lib/workforce/tokens";

const BASE = "http://localhost:3000";
const RUN = Date.now().toString(36);

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  const cookie = res.headers.get("set-cookie")?.split(";")[0];
  if (!res.ok || !cookie) throw new Error(`Login failed for ${email}: ${res.status}`);
  return cookie;
}
async function call(method: string, path: string, cookie?: string, body?: unknown, extraHeaders: Record<string, string> = {}) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...extraHeaders }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text };
}
async function employeeId(admin: string, code: string) {
  const { json } = await call("GET", `/api/employees?search=${code}`, admin);
  return (json.data.find((e: { employeeCode: string }) => e.employeeCode === code) ?? json.data[0]).id as string;
}
async function ensureUser(admin: string, email: string, role: string, name: string, linked?: string) {
  const password = "TestUser@12345";
  const r = await call("POST", "/api/users", admin, { email, password, name, role, ...(linked ? { employeeId: linked } : {}) });
  if (r.status !== 201 && r.status !== 409) throw new Error(`create ${email}: ${r.status} ${r.text}`);
  return login(email, password);
}
const tick = (admin: string, nowIso: string) => call("POST", "/api/workforce/tick", admin, { now: nowIso });


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
  if (r.status !== 201 || !id) throw new Error("could not create a test contractor: " + r.status + " " + r.text);
  return id as string;
}

describe("Contractor workforce: daily loop, client confirmation, month lock (requires live dev server)", () => {
  let admin: string, manager: string, otherManager: string, contractorA: string, contractorB: string;
  let empA = "", empB = "", managerId = "";
  let clientId = "", projectId = "", contactId = "", assignmentA = "", clientIdB = "", projectIdB = "", assignmentB = "";
  let days: Record<string, string> = {}; // "2026-09-28" -> dailyStatusId
  let clientToken = "";

  beforeAll(async () => {
    admin = await login("admin@payrollpro.local", "Admin@12345");
    manager = await login("manager@payrollpro.local", "Manager@12345");
    empA = await createContractor(admin, "A");
    empB = await createContractor(admin, "B");
    otherManager = await ensureUser(admin, "qa.wf.manager2@test.local", "manager", "QA Manager Two");
    contractorA = await ensureUser(admin, `qa.wf.contractor1.${RUN}@test.local`, "employee", "QA Contractor One", empA);
    contractorB = await ensureUser(admin, `qa.wf.contractor2.${RUN}@test.local`, "employee", "QA Contractor Two", empB);
    const users = await call("GET", "/api/users", admin);
    managerId = users.json.data.find((u: { email: string }) => u.email === "manager@payrollpro.local").id;
    // Leave any assignments from earlier runs ended so exclusivity never blocks a fresh run.
    for (const emp of [empA, empB]) {
      const left = await call("GET", `/api/assignments?employeeId=${emp}`, admin);
      for (const a of left.json.data) if (a.status !== "ended") await call("PUT", `/api/assignments/${a.id}`, admin, { status: "ended" });
    }
    await call("PUT", "/api/workforce/flags", admin, { key: "contractor_workforce_enabled", scope: "company", enabled: false });
  });

  afterAll(async () => {
    // Leave nothing switched on and no live assignment behind, so other suites start clean.
    for (const pid of [projectId, projectIdB].filter(Boolean)) {
      for (const key of ["contractor_workforce_enabled", "client_digest_enabled"]) {
        await call("PUT", "/api/workforce/flags", admin, { key, scope: "project", scopeId: pid, enabled: false });
      }
    }
    for (const id of [assignmentA, assignmentB].filter(Boolean)) await call("PUT", `/api/assignments/${id}`, admin, { status: "ended" });
    await call("PUT", "/api/workforce/flags", admin, { key: "contractor_workforce_enabled", scope: "company", enabled: false });
  });

  // ------------------------------------------------------------------ setup
  it("sets up a client, project, representative and a per-day assignment, and switches the module on for that project only", async () => {
    const client = await call("POST", "/api/clients", admin, { name: `Flow Client ${RUN}` });
    expect(client.status).toBe(201); clientId = client.json.data.id;
    const project = await call("POST", "/api/projects", admin, { clientId, name: `Flow Project ${RUN}` });
    projectId = project.json.data.id;
    const contact = await call("POST", `/api/clients/${clientId}/contacts`, admin, { name: "Priya Rep", phone: "9876543210", kind: "representative" });
    contactId = contact.json.data.id;
    const a = await call("POST", "/api/assignments", admin, {
      employeeId: empA, projectId, startDate: "2026-09-28", endDate: "2026-09-30", status: "active", payType: "daily", payRate: 2000,
      resourceCoordinatorId: managerId, clientCoordinatorId: managerId, clientRepContactId: contactId,
    });
    expect(a.status).toBe(201); assignmentA = a.json.data.id;

    // Module OFF: the worker must do nothing at all.
    const off = await tick(admin, "2026-09-28T04:20:00.000Z");
    expect(off.status).toBe(200);
    expect(off.json.data.assignments).toBe(0);

    expect((await call("PUT", "/api/workforce/flags", admin, { key: "contractor_workforce_enabled", scope: "project", scopeId: projectId, enabled: true })).status).toBe(200);
    expect((await call("PUT", "/api/workforce/flags", admin, { key: "client_digest_enabled", scope: "project", scopeId: projectId, enabled: true })).status).toBe(200);
  });

  // ------------------------------------------------------------------ the escalation ladder
  it("a missed check-in raises a call task for the resource coordinator, only once", async () => {
    // 09:50 IST on Mon 28 Sep: 50 minutes after the 09:00 shift start.
    const first = await tick(admin, "2026-09-28T04:20:00.000Z");
    expect(first.json.data.assignments).toBe(1);
    expect(first.json.data.exceptions).toBeGreaterThanOrEqual(1);
    const again = await tick(admin, "2026-09-28T04:20:00.000Z");
    expect(again.json.data.exceptions).toBe(0); // idempotent: same moment, nothing new

    const queue = await call("GET", "/api/workforce/attention", manager);
    expect(queue.status).toBe(200);
    const item = queue.json.data.items.find((i: { type: string; assignmentId: string }) => i.type === "missing_checkin" && i.assignmentId === assignmentA);
    expect(item).toBeTruthy();
    expect(item.section).toBe("call_now");
    expect(item.needsCall).toBe(true);

    // An unassigned coordinator sees nothing; the contractor cannot open the queue at all.
    expect((await call("GET", "/api/workforce/attention", otherManager)).json.data.items.some((i: { assignmentId: string }) => i.assignmentId === assignmentA)).toBe(false);
    expect((await call("GET", "/api/workforce/attention", contractorA)).status).toBe(403);
  });

  it("messages are recorded but suppressed while WhatsApp is not enabled (nothing reaches anyone)", async () => {
    const board = await call("GET", "/api/workforce/board?date=2026-09-28", manager);
    const row = board.json.data.rows.find((r: { assignmentId: string }) => r.assignmentId === assignmentA);
    expect(row).toBeTruthy();
    expect(row.column).toBe("Exception");
    days["2026-09-28"] = row.dailyStatusId;
    const detail = await call("GET", `/api/workforce/days/${row.dailyStatusId}`, manager);
    const sent = detail.json.data.messages.filter((m: { direction: string }) => m.direction === "out");
    expect(sent.length).toBeGreaterThan(0);
    for (const m of sent) { expect(m.status).toBe("suppressed"); expect(m.suppressReason).toBe("whatsapp_not_enabled"); }
  });

  it("the coordinator logs the call and corrects the forgotten check-in; the exception clears itself", async () => {
    const queue = await call("GET", "/api/workforce/attention", manager);
    const item = queue.json.data.items.find((i: { type: string; assignmentId: string }) => i.type === "missing_checkin" && i.assignmentId === assignmentA);
    const contacted = await call("PATCH", `/api/workforce/exceptions/${item.id}`, manager, { action: "contacted", outcome: "connected", note: "Was in a client meeting" });
    expect(contacted.status).toBe(200);

    // Needs the client's confirmation unless an admin overrides.
    const noConfirm = await call("POST", `/api/workforce/days/${days["2026-09-28"]}/correction`, manager, { checkInAt: "2026-09-28T09:05:00+05:30", checkOutAt: "2026-09-28T18:30:00+05:30", reason: "Forgot to check in", clientConfirmed: false });
    expect(noConfirm.status).toBe(400);
    const ok = await call("POST", `/api/workforce/days/${days["2026-09-28"]}/correction`, manager, { checkInAt: "2026-09-28T09:05:00+05:30", checkOutAt: "2026-09-28T18:30:00+05:30", reason: "Forgot to check in", clientConfirmed: true });
    expect(ok.status).toBe(201);
    expect(ok.json.data.daily.state).toBe("present");
    const after = await call("GET", `/api/workforce/days/${days["2026-09-28"]}`, manager);
    expect(after.json.data.exceptions.every((e: { status: string }) => e.status === "resolved")).toBe(true);
  });

  it("the third correction in a month is refused for a coordinator and needs an admin override", async () => {
    await tick(admin, "2026-09-29T04:30:00.000Z");
    await tick(admin, "2026-09-30T04:20:00.000Z");
    for (const d of ["2026-09-29", "2026-09-30"]) {
      const board = await call("GET", `/api/workforce/board?date=${d}`, manager);
      days[d] = board.json.data.rows.find((r: { assignmentId: string }) => r.assignmentId === assignmentA).dailyStatusId;
    }
    const second = await call("POST", `/api/workforce/days/${days["2026-09-29"]}/correction`, manager, { checkInAt: "2026-09-29T09:40:00+05:30", checkOutAt: "2026-09-29T18:40:00+05:30", reason: "Forgot to check in", clientConfirmed: true });
    expect(second.status).toBe(201);
    expect(second.json.data.daily.state).toBe("late");

    const body = { checkInAt: "2026-09-30T09:00:00+05:30", checkOutAt: "2026-09-30T13:12:00+05:30", reason: "Left early, forgot to check in", clientConfirmed: true };
    const refused = await call("POST", `/api/workforce/days/${days["2026-09-30"]}/correction`, manager, body);
    expect(refused.status).toBe(409);
    const noOverride = await call("POST", `/api/workforce/days/${days["2026-09-30"]}/correction`, admin, body);
    expect(noOverride.status).toBe(409); // an admin must say so explicitly
    const overridden = await call("POST", `/api/workforce/days/${days["2026-09-30"]}/correction`, admin, { ...body, adminOverride: true });
    expect(overridden.status).toBe(201);
    // Hours-based rules only apply once a day is closed, so for now it is still provisionally present.
    expect(overridden.json.data.daily.state).toBe("present");
  });

  // ------------------------------------------------------------------ closing days and the client
  it("finished days close themselves the next morning, and a client link shows only that representative's people", async () => {
    const close = await tick(admin, "2026-10-01T05:00:00.000Z"); // 10:30 IST on 1 Oct
    expect(close.json.data.daysClosed).toBeGreaterThanOrEqual(2); // 28 Sep already closed on the 29th
    const expected: Record<string, string> = { "2026-09-28": "present", "2026-09-29": "late", "2026-09-30": "half_day" }; // 4.2 h worked => half-day once closed
    for (const d of Object.keys(expected)) {
      const detail = await call("GET", `/api/workforce/days/${days[d]}`, admin);
      expect(detail.json.data.closed).toBe(true);
      expect(detail.json.data.state).toBe(expected[d]);
    }

    const link = await call("POST", "/api/workforce/client-link", admin, { contactId, projectId, date: "2026-09-30" });
    expect(link.status).toBe(201);
    clientToken = link.json.data.token;
    expect((await call("POST", "/api/workforce/client-link", otherManager, { contactId, projectId, date: "2026-09-30" })).status).toBe(404);

    const view = await call("GET", `/api/workforce/c/${clientToken}?date=2026-09-28`);
    expect(view.status).toBe(200);
    expect(view.json.data.rows).toHaveLength(1);
    expect(view.json.data.rows[0].state).toBe("present");
    expect(JSON.stringify(view.json)).not.toMatch(/payRate|payType|9876543210/); // no pay terms or phone numbers
    expect((await call("GET", "/api/workforce/c/not-a-real-token-value-0000")).status).toBe(404);
    expect((await call("GET", `/api/workforce/t/${clientToken}`)).status).toBe(404); // a client token is not a contractor token
    expect((await call("GET", `/api/workforce/c/${clientToken}?date=2026-09-01`)).json.data.date).toBe("2026-09-30"); // outside the 7-day window falls back
  });

  it("the client confirms two days and disputes one; a dispute blocks sign-off until it is resolved", async () => {
    for (const d of ["2026-09-28", "2026-09-29"]) {
      const r = await call("POST", `/api/workforce/c/${clientToken}`, undefined, { decision: "confirm", assignmentId: assignmentA, date: d });
      expect(r.status).toBe(200);
    }
    const dispute = await call("POST", `/api/workforce/c/${clientToken}`, undefined, { decision: "dispute", assignmentId: assignmentA, date: "2026-09-30", reason: "Was not reachable in the afternoon", claimedHours: 3 });
    expect(dispute.status).toBe(201);
    expect((await call("POST", `/api/workforce/c/${clientToken}`, undefined, { decision: "dispute", assignmentId: "someone-elses", date: "2026-09-30", reason: "x y z" })).status).toBe(404);

    const blocked = await call("POST", `/api/workforce/c/${clientToken}/signoff`, undefined, { year: 2026, month: 9 });
    expect(blocked.status).toBe(409);

    const open = await call("GET", "/api/workforce/disputes", manager);
    const d = open.json.data.find((x: { dailyStatusId: string }) => x.dailyStatusId === days["2026-09-30"]);
    expect(d).toBeTruthy();
    // The dispute also raised a call-queue item. Resolving THAT item is how the coordinator settles it,
    // and it must say whether the client was right, which also closes the dispute record.
    const queue = await call("GET", "/api/workforce/attention", manager);
    const ex = queue.json.data.items.find((i: { type: string }) => i.type === "client_dispute");
    expect(ex).toBeTruthy();
    const noDecision = await call("PATCH", `/api/workforce/exceptions/${ex.id}`, manager, { action: "resolve", note: "Settled with the client" });
    expect(noDecision.status).toBe(400); // a dispute needs a decision
    const settled = await call("PATCH", `/api/workforce/exceptions/${ex.id}`, manager, { action: "resolve", note: "Checked with the contractor: left at 1 pm as recorded", disputeOutcome: "rejected" });
    expect(settled.status).toBe(200);
    const stillOpen = await call("GET", "/api/workforce/disputes", manager);
    expect(stillOpen.json.data.some((x: { dailyStatusId: string }) => x.dailyStatusId === days["2026-09-30"])).toBe(false);
  });

  it("the month can be signed off by the client, then locked by an admin only; locking creates suggestions, not payments", async () => {
    const signed = await call("POST", `/api/workforce/c/${clientToken}/signoff`, undefined, { year: 2026, month: 9 });
    expect(signed.status).toBe(200);

    const month = await call("GET", `/api/workforce/month?projectId=${projectId}&year=2026&month=9`, admin);
    expect(month.status).toBe(200);
    expect(month.json.data.blockers).toEqual([]);
    expect(month.json.data.ready).toBe(true);
    const a = month.json.data.assignments[0];
    expect(a.summary.workedDays).toBe(2.5); // present + late + half-day
    expect(a.prefill.ok).toBe(true);
    expect(a.prefill.suggestedGross).toBe(5000); // 2.5 days x 2000
    // Coordinators never see pay figures.
    const asCoordinator = await call("GET", `/api/workforce/month?projectId=${projectId}&year=2026&month=9`, manager);
    expect(asCoordinator.json.data.assignments[0].payRate).toBeNull();

    expect((await call("POST", "/api/workforce/month/lock", manager, { projectId, year: 2026, month: 9 })).status).toBe(403);
    const lock = await call("POST", "/api/workforce/month/lock", admin, { projectId, year: 2026, month: 9 });
    expect(lock.status).toBe(201);
    expect((await call("POST", "/api/workforce/month/lock", admin, { projectId, year: 2026, month: 9 })).status).toBe(409);

    // Locked days can no longer be corrected.
    const late = await call("POST", `/api/workforce/days/${days["2026-09-28"]}/correction`, admin, { checkInAt: "2026-09-28T09:00:00+05:30", reason: "Trying to change a locked day", clientConfirmed: true, adminOverride: true });
    expect(late.status).toBe(409);
  });

  it("nothing reaches payroll until an admin approves the suggestion", async () => {
    const before = await call("GET", "/api/workforce/month/entries?year=2026&month=9", admin);
    expect(before.json.data.entries).toHaveLength(0);
    expect(before.json.data.blocked[0].reasons.join(" ")).toMatch(/awaiting admin approval/);

    const list = await call("GET", "/api/workforce/suggestions?year=2026&month=9", admin);
    const prefill = list.json.data.find((s: { kind: string; assignmentId: string }) => s.kind === "prefill" && s.assignmentId === assignmentA);
    expect(prefill.status).toBe("pending_admin");
    expect((await call("GET", "/api/workforce/suggestions?year=2026&month=9", manager)).status).toBe(403);
    expect((await call("PATCH", `/api/workforce/suggestions/${prefill.id}`, admin, { decision: "reject" })).status).toBe(400); // a reason is required
    expect((await call("PATCH", `/api/workforce/suggestions/${prefill.id}`, admin, { decision: "approve" })).status).toBe(200);
    expect((await call("PATCH", `/api/workforce/suggestions/${prefill.id}`, admin, { decision: "approve" })).status).toBe(409); // already decided

    const after = await call("GET", "/api/workforce/month/entries?year=2026&month=9", admin);
    expect(after.json.data.entries).toHaveLength(1);
    expect(after.json.data.entries[0]).toMatchObject({ employeeId: empA, unitsWorked: 2.5, rateOverride: 2000, suggestedGross: 5000 });
    expect(after.json.data.payload).toEqual({ month: 9, year: 2026, entries: [{ employeeId: empA, unitsWorked: 2.5, rateOverride: 2000 }] });
  });

  it("reports roll the period up with a transparent score", async () => {
    const r = await call("GET", "/api/workforce/reports?from=2026-09-01&to=2026-09-30&groupBy=contractor", admin);
    expect(r.status).toBe(200);
    const row = r.json.data.find((x: { key: string }) => x.key === empA);
    expect(row.workingDays).toBe(3);
    expect(row.lateDays).toBe(1);
    expect(row.halfDays).toBe(1);
    expect(row.reliability.components.length).toBe(6);
    expect(row.reliability.components.every((c: { reason: string }) => c.reason.length > 0)).toBe(true);
    const csv = await call("GET", "/api/workforce/reports?from=2026-09-01&to=2026-09-30&groupBy=project&format=csv", admin);
    expect(csv.text.split("\n")[0]).toMatch(/^Group,/);
    expect((await call("GET", "/api/workforce/reports?from=2026-09-01&to=2026-09-30&groupBy=contractor", contractorA)).status).toBe(403);
  });

  // ------------------------------------------------------------------ today, in real time: portal, link, WhatsApp webhook
  it("a contractor checks in from the portal and from a signed link, each only for their own assignment", async () => {
    const c2 = await call("POST", "/api/clients", admin, { name: `Flow Client B ${RUN}` });
    clientIdB = c2.json.data.id;
    const p2 = await call("POST", "/api/projects", admin, { clientId: clientIdB, name: `Flow Project B ${RUN}` });
    projectIdB = p2.json.data.id;
    const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
    const a2 = await call("POST", "/api/assignments", admin, { employeeId: empB, projectId: projectIdB, startDate: today, status: "active", payType: "hourly", payRate: 500, resourceCoordinatorId: managerId });
    expect(a2.status).toBe(201); assignmentB = a2.json.data.id;

    // Before the module is on for this project the contractor cannot check in.
    expect((await call("POST", "/api/workforce/me", contractorB, { assignmentId: assignmentB, action: "checkin" })).status).toBe(403);
    await call("PUT", "/api/workforce/flags", admin, { key: "contractor_workforce_enabled", scope: "project", scopeId: projectIdB, enabled: true });

    const mine = await call("GET", "/api/workforce/me", contractorB);
    expect(mine.json.data).toHaveLength(1);
    expect((await call("POST", "/api/workforce/me", contractorA, { assignmentId: assignmentB, action: "checkin" })).status).toBe(404); // not their assignment

    const first = await call("POST", "/api/workforce/me", contractorB, { assignmentId: assignmentB, action: "checkin" });
    expect(first.status).toBe(200);
    const second = await call("POST", "/api/workforce/me", contractorB, { assignmentId: assignmentB, action: "checkin" });
    expect(second.status).toBe(200); // a double tap is harmless
    const dayView = await call("GET", "/api/workforce/me", contractorB);
    const checkInAt = dayView.json.data[0].status.checkInAt;
    expect(checkInAt).toBeTruthy();

    const eod = await call("POST", "/api/workforce/me", contractorB, { assignmentId: assignmentB, action: "eod", completed: "API work", blockers: "Waiting for access", hours: 8 });
    expect(eod.status).toBe(200);
    expect((await call("POST", "/api/workforce/me", contractorB, { assignmentId: assignmentB, action: "eod", hours: 99 })).status).toBe(400);

    const link = await call("POST", `/api/workforce/assignments/${assignmentB}/link`, admin);
    expect(link.status).toBe(201);
    const token = link.json.data.url.split("/u/")[1];
    const viaLink = await call("GET", `/api/workforce/t/${token}`);
    expect(viaLink.json.data.status.checkInAt).toBe(checkInAt);
    expect((await call("POST", `/api/workforce/t/${token}`, undefined, { action: "checkout" })).status).toBe(200);
    expect((await call("GET", "/api/workforce/t/short")).status).toBe(404);
  });

  it("the WhatsApp webhook rejects unsigned calls, answers the handshake, and acts once on a signed button tap", async () => {
    expect((await call("GET", "/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=x&hub.challenge=abc")).status).toBe(403); // nothing configured yet
    expect((await call("PUT", "/api/workforce/whatsapp-secrets", admin, { appSecret: "test-app-secret-123", verifyToken: "test-verify-token-123" })).status).toBe(200);
    expect((await call("PUT", "/api/workforce/whatsapp-secrets", manager, { appSecret: "hacker-secret-1234" })).status).toBe(403);

    const hs = await call("GET", "/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=test-verify-token-123&hub.challenge=hello123");
    expect(hs.status).toBe(200); expect(hs.text).toBe("hello123");
    expect((await call("GET", "/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc")).status).toBe(403);

    const dateKey = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
    const payload = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id: `wamid.${RUN}.1`, from: "919000000002", type: "button", button: { payload: signButtonPayload("pulse_yes", assignmentB, dateKey, 1) } }] } }] }] });
    expect((await call("POST", "/api/whatsapp/webhook", undefined, payload)).status).toBe(401); // unsigned
    expect((await call("POST", "/api/whatsapp/webhook", undefined, payload, { "x-hub-signature-256": "sha256=" + "0".repeat(64) })).status).toBe(401); // wrong signature
    const sig = "sha256=" + createHmac("sha256", "test-app-secret-123").update(payload).digest("hex");
    expect((await call("POST", "/api/whatsapp/webhook", undefined, payload, { "x-hub-signature-256": sig })).status).toBe(200);
    expect((await call("POST", "/api/whatsapp/webhook", undefined, payload, { "x-hub-signature-256": sig })).status).toBe(200); // Meta retries: harmless

    // A forged payload (wrong MAC) is ignored, not obeyed.
    const forged = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id: `wamid.${RUN}.2`, from: "919000000002", type: "button", button: { payload: `checkin.${assignmentA}.2026-09-28.0.AAAAAAAAAAAAAAAA` } }] } }] }] });
    const fsig = "sha256=" + createHmac("sha256", "test-app-secret-123").update(forged).digest("hex");
    expect((await call("POST", "/api/whatsapp/webhook", undefined, forged, { "x-hub-signature-256": fsig })).status).toBe(200);
  });

  it("health shows the worker and switches", async () => {
    const h = await call("GET", "/api/workforce/health", admin);
    expect(h.status).toBe(200);
    expect(h.json.data.worker.tickCount).toBeGreaterThan(0);
    expect(h.json.data.enabledFlags.length).toBeGreaterThan(0);
    expect((await call("GET", "/api/workforce/health", manager)).status).toBe(403);
    expect((await call("POST", "/api/workforce/tick", manager, {})).status).toBe(403);
  });
});
