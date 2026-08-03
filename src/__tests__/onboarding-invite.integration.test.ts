// Integration tests for the self-service new-joiner onboarding feature: HR sends a token
// link, the candidate fills their own details/documents with no login, then HR reviews.
// Hits a REAL running server (`npm run dev` on localhost:3000) with a REAL database — not
// mocked. Excluded from the default `npm test` run (see vitest.integration.config.ts).
// Run manually with the dev server up:
// `npx vitest run --config vitest.integration.config.ts src/__tests__/onboarding-invite.integration.test.ts`
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";

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

// A minimal valid 1x1 PNG, embedded so uploads don't depend on any file in the repo.
const PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
function pngFile(name: string): File {
  const bytes = Buffer.from(PNG_BASE64, "base64");
  return new File([bytes], name, { type: "image/png" });
}

function tokenFromUrl(url: string): string {
  const match = url.match(/\/onboard\/([^/?#]+)/);
  if (!match) throw new Error(`Could not extract token from inviteUrl: ${url}`);
  return match[1];
}

const REQUIRED_DOC_TYPES = ["photo", "pan", "aadhaar", "bank_proof", "education_certificate"];

const REQUIRED_SUBMISSION_FIELDS = {
  phone: "9876543210",
  dateOfBirth: "1995-05-15",
  gender: "male",
  currentAddress: "123 Test Street, Mumbai",
  permanentAddress: "123 Test Street, Mumbai",
  emergencyContact: "Jane Doe, 9876500000",
  panNumber: "ABCDE1234F",
  aadhaarNumber: "123412341234",
  bankName: "Test Bank",
  bankAccountNumber: "1234567890",
  bankIfsc: "HDFC0001234",
};

describe("Self-onboarding invite flow (requires live dev server)", () => {
  let adminCookie: string;
  let managerCookie: string;
  let employeeCookie: string;
  const createdEmployeeIds: string[] = [];
  const createdInviteIds: string[] = [];

  beforeAll(async () => {
    adminCookie = await login("admin@payrollpro.local", "Admin@12345");
    managerCookie = await login("manager@payrollpro.local", "Manager@12345");
    const selfId = await resolveEmployeeId(adminCookie, "EMP001");
    employeeCookie = await ensureEmployeeLogin(adminCookie, "qa.onboardtest.employee@test.local", selfId);
  });

  afterAll(async () => {
    // These employees/invites/documents exist only for this test run — no soft-delete or
    // finalize path fits a candidate that never really joined, so this cleans up directly
    // against the same SQLite file the dev server uses (consistent with how prod-side
    // cleanup for this feature is done via direct DB access when a feature has no delete API).
    if (createdInviteIds.length) {
      await db.onboardingInvite.deleteMany({ where: { id: { in: createdInviteIds } } });
    }
    if (createdEmployeeIds.length) {
      await db.employeeDocument.deleteMany({ where: { employeeId: { in: createdEmployeeIds } } });
      await db.employee.deleteMany({ where: { id: { in: createdEmployeeIds } } });
    }
    await db.$disconnect();
  });

  function uniqueEmail(tag: string): string {
    return `qa.onboarding.${tag}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@test.local`;
  }

  async function createInvite(overrides: Record<string, unknown> = {}) {
    const res = await fetch(`${BASE}/api/onboarding-invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        firstName: "QA",
        lastName: "Candidate",
        email: uniqueEmail("create"),
        designation: "QA Engineer",
        department: "Quality",
        dateOfJoining: "2026-09-01",
        ...overrides,
      }),
    });
    if (res.status !== 201) throw new Error(`createInvite failed: ${res.status} ${await res.text()}`);
    const { data } = await res.json();
    createdInviteIds.push(data.invite.id);
    createdEmployeeIds.push(data.employee.id);
    return { inviteId: data.invite.id as string, employeeId: data.employee.id as string, token: tokenFromUrl(data.inviteUrl as string) };
  }

  async function uploadAllRequiredDocs(token: string) {
    for (const docType of REQUIRED_DOC_TYPES) {
      const form = new FormData();
      form.append("file", pngFile(`${docType}.png`));
      form.append("docType", docType);
      const res = await fetch(`${BASE}/api/onboarding-invite/${token}/documents`, { method: "POST", body: form });
      expect(res.status, `upload of ${docType}`).toBe(201);
    }
  }

  // ---- Role gating on the admin (plural) surface ----
  describe("role gating on admin routes", () => {
    it("employee and manager are blocked from listing invites; admin is allowed", async () => {
      const asEmployee = await fetch(`${BASE}/api/onboarding-invites`, { headers: { Cookie: employeeCookie } });
      expect(asEmployee.status).toBe(403);
      const asManager = await fetch(`${BASE}/api/onboarding-invites`, { headers: { Cookie: managerCookie } });
      expect(asManager.status).toBe(403);
      const asAdmin = await fetch(`${BASE}/api/onboarding-invites`, { headers: { Cookie: adminCookie } });
      expect(asAdmin.status).toBe(200);
    });

    it("employee and manager are blocked from creating an invite", async () => {
      const body = JSON.stringify({
        firstName: "Nope", email: uniqueEmail("blocked"), designation: "X", department: "Y", dateOfJoining: "2026-09-01",
      });
      const asEmployee = await fetch(`${BASE}/api/onboarding-invites`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: employeeCookie }, body,
      });
      expect(asEmployee.status).toBe(403);
      const asManager = await fetch(`${BASE}/api/onboarding-invites`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: managerCookie }, body,
      });
      expect(asManager.status).toBe(403);
    });

    it("employee and manager are blocked from resend/revoke/review on a real invite", async () => {
      const { inviteId } = await createInvite();
      for (const [path, method] of [["resend", "POST"], ["revoke", "POST"], ["review", "POST"]] as const) {
        const body = path === "review" ? JSON.stringify({ decision: "approved" }) : undefined;
        const asEmployee = await fetch(`${BASE}/api/onboarding-invites/${inviteId}/${path}`, {
          method, headers: { "Content-Type": "application/json", Cookie: employeeCookie }, body,
        });
        expect(asEmployee.status, path).toBe(403);
        const asManager = await fetch(`${BASE}/api/onboarding-invites/${inviteId}/${path}`, {
          method, headers: { "Content-Type": "application/json", Cookie: managerCookie }, body,
        });
        expect(asManager.status, path).toBe(403);
      }
    });
  });

  // ---- Public token surface: malformed/unknown tokens ----
  describe("public token surface robustness", () => {
    it("a bogus token returns 404, never 500", async () => {
      const res = await fetch(`${BASE}/api/onboarding-invite/this-token-does-not-exist-at-all`);
      expect(res.status).toBe(404);
    });

    it("a bogus token is rejected the same way on write routes", async () => {
      const patchRes = await fetch(`${BASE}/api/onboarding-invite/bogus-token/`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      expect([404, 405]).toContain(patchRes.status);
    });

    it("public token routes are reachable with zero cookies (middleware allow-list)", async () => {
      const { token } = await createInvite();
      const res = await fetch(`${BASE}/api/onboarding-invite/${token}`);
      expect(res.status).toBe(200);
    });

    it("the plural admin prefix stays protected with zero cookies (trailing-slash regression guard)", async () => {
      const res = await fetch(`${BASE}/api/onboarding-invites`);
      expect(res.status).toBe(401);
    });
  });

  // ---- Full happy path ----
  describe("full happy path: create -> fill -> upload -> submit -> approve", () => {
    it("walks the entire lifecycle end to end", async () => {
      const { inviteId, employeeId, token } = await createInvite();

      // 1. Employee created immediately, tagged onboarding — never touches active headcount.
      const createdEmp = await fetch(`${BASE}/api/employees/${employeeId}`, { headers: { Cookie: adminCookie } });
      expect((await createdEmp.json()).onboardingStatus).toBe("onboarding");

      // 2. Public read never exposes salaryStructure.
      const readRes = await fetch(`${BASE}/api/onboarding-invite/${token}`);
      expect(readRes.status).toBe(200);
      const read = await readRes.json();
      expect(read.data.status).toBe("sent");
      expect("salaryStructure" in read.data.employee).toBe(false);

      // 3. First PATCH flips sent -> in_progress and persists fields.
      const patchRes = await fetch(`${BASE}/api/onboarding-invite/${token}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(REQUIRED_SUBMISSION_FIELDS),
      });
      expect(patchRes.status).toBe(200);
      const afterPatch = await (await fetch(`${BASE}/api/onboarding-invite/${token}`)).json();
      expect(afterPatch.data.status).toBe("in_progress");
      expect(afterPatch.data.employee.panNumber).toBe("ABCDE1234F");

      // 4. Submit is blocked while required documents are missing.
      const earlySubmit = await fetch(`${BASE}/api/onboarding-invite/${token}/submit`, { method: "POST" });
      expect(earlySubmit.status).toBe(400);

      // 5. Upload every required document.
      await uploadAllRequiredDocs(token);

      // 5b. The candidate can delete and replace a wrong upload before submitting.
      const beforeDelete = await (await fetch(`${BASE}/api/onboarding-invite/${token}`)).json();
      expect(beforeDelete.data.documents.length).toBe(REQUIRED_DOC_TYPES.length);
      const photoDoc = beforeDelete.data.documents.find((d: { docType: string }) => d.docType === "photo");
      const deleteRes = await fetch(`${BASE}/api/onboarding-invite/${token}/documents/${photoDoc.id}`, { method: "DELETE" });
      expect(deleteRes.status).toBe(200);
      const afterDelete = await (await fetch(`${BASE}/api/onboarding-invite/${token}`)).json();
      expect(afterDelete.data.documents.length).toBe(REQUIRED_DOC_TYPES.length - 1);
      // Submit is blocked again until the deleted required doc is re-uploaded.
      const submitMissingPhoto = await fetch(`${BASE}/api/onboarding-invite/${token}/submit`, { method: "POST" });
      expect(submitMissingPhoto.status).toBe(400);
      const reuploadForm = new FormData();
      reuploadForm.append("file", pngFile("photo-retry.png"));
      reuploadForm.append("docType", "photo");
      const reuploadRes = await fetch(`${BASE}/api/onboarding-invite/${token}/documents`, { method: "POST", body: reuploadForm });
      expect(reuploadRes.status).toBe(201);

      // 6. Submit now succeeds.
      const submitRes = await fetch(`${BASE}/api/onboarding-invite/${token}/submit`, { method: "POST" });
      expect(submitRes.status).toBe(200);

      // 7. A submitted invite is no longer editable.
      const editAfterSubmit = await fetch(`${BASE}/api/onboarding-invite/${token}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      expect(editAfterSubmit.status).toBe(409);

      // 8. Admin sees it queued for review, with all 5 documents attached.
      const listRes = await fetch(`${BASE}/api/onboarding-invites?status=submitted`, { headers: { Cookie: adminCookie } });
      const { data: list } = await listRes.json();
      expect(list.some((i: { id: string }) => i.id === inviteId)).toBe(true);

      const detailRes = await fetch(`${BASE}/api/onboarding-invites/${inviteId}`, { headers: { Cookie: adminCookie } });
      const { data: detail } = await detailRes.json();
      expect(detail.documents.length).toBe(REQUIRED_DOC_TYPES.length);

      // 9. Approve -> employee flips active, invite flips approved.
      const approveRes = await fetch(`${BASE}/api/onboarding-invites/${inviteId}/review`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: adminCookie }, body: JSON.stringify({ decision: "approved" }),
      });
      expect(approveRes.status).toBe(200);

      const finalEmp = await fetch(`${BASE}/api/employees/${employeeId}`, { headers: { Cookie: adminCookie } });
      expect((await finalEmp.json()).onboardingStatus).toBe("active");

      // 10. Approved is terminal: the candidate's link is dead, and admin resend/revoke are blocked.
      const readAfterApprove = await fetch(`${BASE}/api/onboarding-invite/${token}`);
      expect(readAfterApprove.status).toBe(410);

      const resendAfterApprove = await fetch(`${BASE}/api/onboarding-invites/${inviteId}/resend`, {
        method: "POST", headers: { Cookie: adminCookie },
      });
      expect(resendAfterApprove.status).toBe(409);
      const revokeAfterApprove = await fetch(`${BASE}/api/onboarding-invites/${inviteId}/revoke`, {
        method: "POST", headers: { Cookie: adminCookie },
      });
      expect(revokeAfterApprove.status).toBe(409);
    });
  });

  // ---- Reject path: token rotation on reopen ----
  describe("reject path", () => {
    it("rejecting reopens the invite behind a freshly rotated token; the old link dies", async () => {
      const { inviteId, token: oldToken } = await createInvite();

      await fetch(`${BASE}/api/onboarding-invite/${oldToken}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(REQUIRED_SUBMISSION_FIELDS),
      });
      await uploadAllRequiredDocs(oldToken);
      const submitRes = await fetch(`${BASE}/api/onboarding-invite/${oldToken}/submit`, { method: "POST" });
      expect(submitRes.status).toBe(200);

      const rejectRes = await fetch(`${BASE}/api/onboarding-invites/${inviteId}/review`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ decision: "rejected", reason: "IFSC code looks wrong, please re-check." }),
      });
      expect(rejectRes.status).toBe(200);
      const { data: rejectData } = await rejectRes.json();
      const newToken = tokenFromUrl(rejectData.inviteUrl);
      expect(newToken).not.toBe(oldToken);

      // Old token is dead — a fresh hash lookup finds nothing.
      const oldTokenRes = await fetch(`${BASE}/api/onboarding-invite/${oldToken}`);
      expect(oldTokenRes.status).toBe(404);

      // New token works and surfaces the rejection reason.
      const newTokenRes = await fetch(`${BASE}/api/onboarding-invite/${newToken}`);
      expect(newTokenRes.status).toBe(200);
      const newData = await newTokenRes.json();
      expect(newData.data.status).toBe("rejected");
      expect(newData.data.rejectionReason).toMatch(/IFSC/);

      // Candidate can fix and resubmit through the new token.
      await fetch(`${BASE}/api/onboarding-invite/${newToken}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bankIfsc: "HDFC0009999" }),
      });
      const resubmitRes = await fetch(`${BASE}/api/onboarding-invite/${newToken}/submit`, { method: "POST" });
      expect(resubmitRes.status).toBe(200);
    });
  });

  // ---- Revoke / resend ----
  describe("revoke and resend", () => {
    it("a revoked invite is terminal for the candidate, but resend un-revokes it with a new token", async () => {
      const { inviteId, token } = await createInvite();

      const revokeRes = await fetch(`${BASE}/api/onboarding-invites/${inviteId}/revoke`, {
        method: "POST", headers: { Cookie: adminCookie },
      });
      expect(revokeRes.status).toBe(200);

      const revokedTokenRes = await fetch(`${BASE}/api/onboarding-invite/${token}`);
      expect(revokedTokenRes.status).toBe(410);

      const resendRes = await fetch(`${BASE}/api/onboarding-invites/${inviteId}/resend`, {
        method: "POST", headers: { Cookie: adminCookie },
      });
      expect(resendRes.status).toBe(200);
      const { data: resendData } = await resendRes.json();
      const newToken = tokenFromUrl(resendData.inviteUrl);
      expect(newToken).not.toBe(token);

      const newTokenRes = await fetch(`${BASE}/api/onboarding-invite/${newToken}`);
      expect(newTokenRes.status).toBe(200);
      expect((await newTokenRes.json()).data.status).not.toBe("revoked");
    });
  });

  // ---- Payroll / dashboard exclusion parity ----
  // These two routes select "active employees" via `{ dateOfExit: null, onboardingStatus:
  // "active" }" — the same where-clause exercised directly here to confirm an onboarding-status
  // employee is excluded, then included once approved, without needing a full payroll run
  // (which requires a salary structure this disposable test employee deliberately has none of).
  describe("payroll & dashboard active-employee query parity", () => {
    it("excludes an onboarding-status employee, includes them once approved", async () => {
      const { inviteId, employeeId, token } = await createInvite();

      const beforeCount = await db.employee.count({ where: { id: employeeId, dateOfExit: null, onboardingStatus: "active" } });
      expect(beforeCount).toBe(0);

      // Review only accepts a "submitted" invite — walk it through the real flow first.
      await fetch(`${BASE}/api/onboarding-invite/${token}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(REQUIRED_SUBMISSION_FIELDS),
      });
      await uploadAllRequiredDocs(token);
      await fetch(`${BASE}/api/onboarding-invite/${token}/submit`, { method: "POST" });

      const approveRes = await fetch(`${BASE}/api/onboarding-invites/${inviteId}/review`, {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: adminCookie }, body: JSON.stringify({ decision: "approved" }),
      });
      expect(approveRes.status).toBe(200);

      const afterCount = await db.employee.count({ where: { id: employeeId, dateOfExit: null, onboardingStatus: "active" } });
      expect(afterCount).toBe(1);
    });

    it("dashboard totalEmployees does not count a freshly created onboarding invite", async () => {
      const before = await fetch(`${BASE}/api/dashboard`, { headers: { Cookie: adminCookie } });
      const beforeTotal = (await before.json()).totalEmployees;

      await createInvite();

      const after = await fetch(`${BASE}/api/dashboard`, { headers: { Cookie: adminCookie } });
      const afterTotal = (await after.json()).totalEmployees;
      expect(afterTotal).toBe(beforeTotal);
    });
  });

  // ---- Employees list: visible by default, filterable by onboarding status ----
  describe("employees list visibility", () => {
    it("an onboarding-status employee stays visible in the default employees list, tagged", async () => {
      const { employeeId } = await createInvite();
      const res = await fetch(`${BASE}/api/employees?limit=200`, { headers: { Cookie: adminCookie } });
      const { data } = await res.json();
      const found = data.find((e: { id: string }) => e.id === employeeId);
      expect(found).toBeTruthy();
      expect(found.onboardingStatus).toBe("onboarding");
    });

    it("?onboardingStatus= filters correctly in both directions", async () => {
      const { employeeId } = await createInvite();

      const onboardingOnly = await fetch(`${BASE}/api/employees?onboardingStatus=onboarding&limit=200`, { headers: { Cookie: adminCookie } });
      const { data: onboardingList } = await onboardingOnly.json();
      expect(onboardingList.some((e: { id: string }) => e.id === employeeId)).toBe(true);

      const activeOnly = await fetch(`${BASE}/api/employees?onboardingStatus=active&limit=200`, { headers: { Cookie: adminCookie } });
      const { data: activeList } = await activeOnly.json();
      expect(activeList.some((e: { id: string }) => e.id === employeeId)).toBe(false);
    });
  });
});
