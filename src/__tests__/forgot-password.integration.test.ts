// Integration tests for self-service password reset: a public "forgot password" request +
// a token-based reset link, available to every login role. Hits a REAL running server
// (`npm run dev` on localhost:3000) with a REAL database — not mocked. Excluded from the
// default `npm test` run (see vitest.integration.config.ts).
// Run manually with the dev server up:
// `npx vitest run --config vitest.integration.config.ts src/__tests__/forgot-password.integration.test.ts`
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db";
import { generateResetToken, hashResetToken, newResetExpiry } from "@/lib/password-reset";

const BASE = "http://localhost:3000";

async function login(email: string, password: string): Promise<Response> {
  return fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
}

async function adminLogin(): Promise<string> {
  const res = await login("admin@payrollpro.local", "Admin@12345");
  const cookie = res.headers.get("set-cookie")?.split(";")[0];
  if (!res.ok || !cookie) throw new Error(`Admin login failed: ${res.status}`);
  return cookie;
}

describe("Forgot password (requires live dev server)", () => {
  let adminCookie: string;
  let testUserId: string;
  const testEmail = `qa.forgotpw.${Date.now()}@test.local`;
  const originalPassword = "OriginalPass@123";

  beforeAll(async () => {
    adminCookie = await adminLogin();
    const res = await fetch(`${BASE}/api/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ email: testEmail, password: originalPassword, name: "QA ForgotPW", role: "employee" }),
    });
    if (!res.ok) throw new Error(`Failed to create test user: ${res.status} ${await res.text()}`);
    const json = await res.json();
    testUserId = json.data.id;
  });

  afterAll(async () => {
    if (testUserId) {
      await db.passwordResetToken.deleteMany({ where: { userId: testUserId } });
      await db.user.deleteMany({ where: { id: testUserId } });
    }
    await db.$disconnect();
  });

  async function insertResetToken(userId: string, overrides: { expiresAt?: Date; usedAt?: Date | null } = {}) {
    const rawToken = generateResetToken();
    await db.passwordResetToken.create({
      data: {
        userId,
        tokenHash: hashResetToken(rawToken),
        expiresAt: overrides.expiresAt ?? newResetExpiry(),
        usedAt: overrides.usedAt ?? null,
      },
    });
    return rawToken;
  }

  it("anti-enumeration: a real email and a nonexistent one return the identical response", async () => {
    const realRes = await fetch(`${BASE}/api/auth/forgot-password`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail }),
    });
    const realJson = await realRes.json();

    const fakeRes = await fetch(`${BASE}/api/auth/forgot-password`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `definitely.not.a.real.user.${Date.now()}@test.local` }),
    });
    const fakeJson = await fakeRes.json();

    expect(realRes.status).toBe(200);
    expect(fakeRes.status).toBe(200);
    expect(realJson).toEqual(fakeJson);
  });

  it("an inactive account gets the same generic response, but no token row is created", async () => {
    const inactiveEmail = `qa.forgotpw.inactive.${Date.now()}@test.local`;
    const createRes = await fetch(`${BASE}/api/users`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ email: inactiveEmail, password: "SomePass@123", name: "QA Inactive", role: "employee" }),
    });
    const created = await createRes.json();
    const inactiveUserId = created.data.id;
    await fetch(`${BASE}/api/users/${inactiveUserId}`, {
      method: "PUT", headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ active: false }),
    });

    const res = await fetch(`${BASE}/api/auth/forgot-password`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inactiveEmail }),
    });
    expect(res.status).toBe(200);

    const count = await db.passwordResetToken.count({ where: { userId: inactiveUserId } });
    expect(count).toBe(0);

    await db.user.deleteMany({ where: { id: inactiveUserId } });
  });

  it("a valid token resets the password; old password stops working, new one works", async () => {
    const rawToken = await insertResetToken(testUserId);
    const newPassword = "BrandNewPass@456";

    const resetRes = await fetch(`${BASE}/api/auth/reset-password/${rawToken}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword }),
    });
    expect(resetRes.status).toBe(200);
    expect(resetRes.headers.get("set-cookie")).toBeNull(); // no auto-login

    const oldLoginRes = await login(testEmail, originalPassword);
    expect(oldLoginRes.status).toBe(401);

    const newLoginRes = await login(testEmail, newPassword);
    expect(newLoginRes.status).toBe(200);
  });

  it("a used token cannot be reused", async () => {
    const rawToken = await insertResetToken(testUserId);
    const first = await fetch(`${BASE}/api/auth/reset-password/${rawToken}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: "FirstReset@789" }),
    });
    expect(first.status).toBe(200);

    const second = await fetch(`${BASE}/api/auth/reset-password/${rawToken}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: "SecondReset@789" }),
    });
    expect(second.status).toBe(400);
    const firstBody = await first.json();
    expect(firstBody.success).toBe(true);
  });

  it("an expired token is rejected with the same generic message as other invalid reasons", async () => {
    const expiredToken = await insertResetToken(testUserId, { expiresAt: new Date(Date.now() - 1000) });
    const res = await fetch(`${BASE}/api/auth/reset-password/${expiredToken}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: "WontWork@123" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();

    const bogusRes = await fetch(`${BASE}/api/auth/reset-password/not-a-real-token-at-all`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: "WontWork@123" }),
    });
    expect(bogusRes.status).toBe(400);
    const bogusBody = await bogusRes.json();

    expect(body.error).toBe(bogusBody.error);
  });

  it("GET validity check returns true for a fresh token, false for expired/used/bogus", async () => {
    const freshToken = await insertResetToken(testUserId);
    const freshRes = await fetch(`${BASE}/api/auth/reset-password/${freshToken}`);
    expect((await freshRes.json()).valid).toBe(true);

    const expiredToken = await insertResetToken(testUserId, { expiresAt: new Date(Date.now() - 1000) });
    const expiredRes = await fetch(`${BASE}/api/auth/reset-password/${expiredToken}`);
    expect((await expiredRes.json()).valid).toBe(false);

    const usedToken = await insertResetToken(testUserId, { usedAt: new Date() });
    const usedRes = await fetch(`${BASE}/api/auth/reset-password/${usedToken}`);
    expect((await usedRes.json()).valid).toBe(false);

    const bogusRes = await fetch(`${BASE}/api/auth/reset-password/bogus-token-xyz`);
    expect((await bogusRes.json()).valid).toBe(false);
  });

  it("rate limits repeated forgot-password requests from the same IP", async () => {
    // Uses a nonexistent email so no real send happens on each iteration (a real user's email
    // would trigger a slow real Ethereal send per request, unrelated to what this test checks —
    // the rate limiter runs before the user lookup either way, so this is an equally valid check).
    const ip = `10.88.${Date.now() % 255}.1`;
    const nonexistentEmail = `qa.forgotpw.ratelimit.${Date.now()}@test.local`;
    const results: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await fetch(`${BASE}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({ email: nonexistentEmail }),
      });
      results.push(res.status);
    }
    expect(results).toContain(429);
  });
});
