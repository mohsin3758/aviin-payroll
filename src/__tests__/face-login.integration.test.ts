// Integration tests for company-wide mandatory face verification at login: an extra step
// after password, only for logins linked to an Employee record, reusing the same
// FaceEnrollment already used for attendance. Hits a REAL running server (`npm run dev` on
// localhost:3000) with a REAL database — not mocked. Excluded from the default `npm test` run
// (see vitest.integration.config.ts).
// Run manually with the dev server up:
// `npx vitest run --config vitest.integration.config.ts src/__tests__/face-login.integration.test.ts`
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { FACE_LOGIN_MATCH_THRESHOLD } from "@/lib/face-match";

const BASE = "http://localhost:3000";
const TEST_PASSWORD = "TestFace@12345";

function baseDescriptor(): number[] {
  return new Array(128).fill(0.1);
}
function farDescriptor(base: number[]): number[] {
  const d = [...base];
  d[0] = base[0] + FACE_LOGIN_MATCH_THRESHOLD + 0.5; // well past the strict login threshold
  return d;
}

function extractCookie(res: Response): string | null {
  return res.headers.get("set-cookie")?.split(";")[0] ?? null;
}

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const cookie = extractCookie(res);
  if (!res.ok || !cookie) throw new Error(`Login failed for ${email}: ${res.status}`);
  return cookie;
}

async function setRequireFaceLogin(adminCookie: string, value: boolean) {
  const res = await fetch(`${BASE}/api/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: adminCookie },
    body: JSON.stringify({ requireFaceLogin: value }),
  });
  if (!res.ok) throw new Error(`Failed to set requireFaceLogin=${value}: ${res.status}`);
}

describe("Face verification at login (requires live dev server)", () => {
  let adminCookie: string;
  let testEmployeeId: string;
  let testUserId: string;
  const testEmail = `qa.facelogin.${Date.now()}@test.local`;

  beforeAll(async () => {
    adminCookie = await login("admin@payrollpro.local", "Admin@12345");

    const empRes = await fetch(`${BASE}/api/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        firstName: "QA", lastName: "FaceLogin", email: testEmail,
        designation: "QA Engineer", department: "Quality", dateOfJoining: "2026-01-01",
      }),
    });
    if (!empRes.ok) throw new Error(`Failed to create test employee: ${empRes.status} ${await empRes.text()}`);
    const emp = await empRes.json();
    testEmployeeId = emp.id;

    const userRes = await fetch(`${BASE}/api/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ email: testEmail, password: TEST_PASSWORD, name: "QA FaceLogin", role: "employee", employeeId: testEmployeeId }),
    });
    if (!userRes.ok) throw new Error(`Failed to create test user: ${userRes.status} ${await userRes.text()}`);
    const user = await userRes.json();
    testUserId = user.data.id;
  });

  afterAll(async () => {
    // Always leave the setting off, whatever happens above — this must never linger enabled on
    // a shared dev DB just because a test ran.
    await setRequireFaceLogin(adminCookie, false).catch(() => {});
    if (testUserId) await db.user.deleteMany({ where: { id: testUserId } });
    if (testEmployeeId) {
      await db.faceEnrollment.deleteMany({ where: { employeeId: testEmployeeId } });
      await db.employee.deleteMany({ where: { id: testEmployeeId } });
    }
    await db.$disconnect();
  });

  it("feature off (default state): login is completely unaffected", async () => {
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: TEST_PASSWORD }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.user).toBeTruthy();
    expect(json.requiresFaceVerification).toBeUndefined();
  });

  describe("with the setting enabled", () => {
    beforeAll(async () => {
      await setRequireFaceLogin(adminCookie, true);
    });

    it("a login with no linked employee record is exempt (critical anti-lockout guarantee)", async () => {
      const res = await fetch(`${BASE}/api/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@payrollpro.local", password: "Admin@12345" }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.requiresFaceVerification).toBeUndefined();
      expect(json.user).toBeTruthy();
      // The exemption exists *because* this seeded account has no linked employee — confirm
      // that precondition is actually true, so this test can't silently stop meaning anything.
      expect(json.user.employeeId).toBeNull();
    });

    it("an employee-linked login not yet enrolled is asked to enroll, not just verify", async () => {
      const res = await fetch(`${BASE}/api/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testEmail, password: TEST_PASSWORD }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.requiresFaceVerification).toBe(true);
      expect(json.enrolled).toBe(false);
      expect(typeof json.pendingToken).toBe("string");
    });

    it("enrolling at login completes the session, and a subsequent login now offers verify (enrolled: true)", async () => {
      const loginRes = await fetch(`${BASE}/api/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testEmail, password: TEST_PASSWORD }),
      });
      const { pendingToken, enrolled } = await loginRes.json();
      expect(enrolled).toBe(false);

      const enrollRes = await fetch(`${BASE}/api/auth/face-login/enroll`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingToken, descriptor: baseDescriptor(), consent: true }),
      });
      expect(enrollRes.status).toBe(200);
      expect(extractCookie(enrollRes)).toBeTruthy();
      const enrollJson = await enrollRes.json();
      expect(enrollJson.user.email).toBe(testEmail);

      const secondLoginRes = await fetch(`${BASE}/api/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testEmail, password: TEST_PASSWORD }),
      });
      const secondLoginJson = await secondLoginRes.json();
      expect(secondLoginJson.requiresFaceVerification).toBe(true);
      expect(secondLoginJson.enrolled).toBe(true);
    });

    it("a matching descriptor completes the login; a non-matching one is rejected with no session", async () => {
      const loginRes = await fetch(`${BASE}/api/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testEmail, password: TEST_PASSWORD }),
      });
      const { pendingToken } = await loginRes.json();

      const wrongFaceRes = await fetch(`${BASE}/api/auth/face-login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingToken, descriptor: farDescriptor(baseDescriptor()) }),
      });
      expect(wrongFaceRes.status).toBe(401);
      expect(extractCookie(wrongFaceRes)).toBeNull();

      const rightFaceRes = await fetch(`${BASE}/api/auth/face-login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingToken, descriptor: baseDescriptor() }),
      });
      expect(rightFaceRes.status).toBe(200);
      expect(extractCookie(rightFaceRes)).toBeTruthy();
    });

    it("rejects a bogus/garbage pendingToken on both face-login routes", async () => {
      const verifyRes = await fetch(`${BASE}/api/auth/face-login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingToken: "not-a-real-token", descriptor: baseDescriptor() }),
      });
      expect(verifyRes.status).toBe(401);

      const enrollRes = await fetch(`${BASE}/api/auth/face-login/enroll`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingToken: "not-a-real-token", descriptor: baseDescriptor(), consent: true }),
      });
      expect(enrollRes.status).toBe(401);
    });

    it("rate limits repeated face-login attempts from the same IP", async () => {
      const ip = `10.99.${Date.now() % 255}.1`;
      const results: number[] = [];
      for (let i = 0; i < 12; i++) {
        const res = await fetch(`${BASE}/api/auth/face-login`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
          body: JSON.stringify({ pendingToken: "not-a-real-token", descriptor: baseDescriptor() }),
        });
        results.push(res.status);
      }
      expect(results).toContain(429);
    });
  });

  it("toggling the feature back off reverts even an already-enrolled employee to plain password login", async () => {
    await setRequireFaceLogin(adminCookie, false);
    const res = await fetch(`${BASE}/api/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: TEST_PASSWORD }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.user).toBeTruthy();
    expect(json.requiresFaceVerification).toBeUndefined();
  });
});
