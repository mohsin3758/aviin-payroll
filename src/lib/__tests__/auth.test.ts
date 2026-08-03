import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  signSession,
  SESSION_COOKIE_NAME,
  AuthError,
  requireAuth,
  requireRole,
  requireOwnEmployeeId,
  scopeToOwnEmployeeIfSelf,
  requireSelfOrRole,
  signPendingFaceToken,
  verifyPendingFaceToken,
  type SessionPayload,
} from "../auth";

async function requestAs(session: SessionPayload | null): Promise<NextRequest> {
  const headers: Record<string, string> = {};
  if (session) {
    const token = await signSession(session);
    headers.cookie = `${SESSION_COOKIE_NAME}=${token}`;
  }
  return new NextRequest("http://localhost/api/test", { headers });
}

const admin: SessionPayload = { userId: "u-admin", email: "admin@test.local", name: "Admin", role: "admin", employeeId: null };
const manager: SessionPayload = { userId: "u-mgr", email: "mgr@test.local", name: "Manager", role: "manager", employeeId: null };
const employeeWithLink: SessionPayload = { userId: "u-emp", email: "emp@test.local", name: "Employee", role: "employee", employeeId: "emp-1" };
const employeeNoLink: SessionPayload = { userId: "u-emp2", email: "emp2@test.local", name: "Employee2", role: "employee", employeeId: null };

describe("requireAuth", () => {
  it("throws 401 with no session cookie", async () => {
    const req = await requestAs(null);
    await expect(requireAuth(req)).rejects.toMatchObject({ status: 401 });
  });

  it("resolves the session payload for a valid cookie", async () => {
    const req = await requestAs(admin);
    const session = await requireAuth(req);
    expect(session.role).toBe("admin");
  });
});

describe("requireRole", () => {
  it("throws 403 for a disallowed role", async () => {
    const req = await requestAs(manager);
    await expect(requireRole(req, ["admin", "hr"])).rejects.toMatchObject({ status: 403 });
  });

  it("resolves for an allowed role", async () => {
    const req = await requestAs(manager);
    const session = await requireRole(req, ["admin", "manager"]);
    expect(session.role).toBe("manager");
  });
});

describe("requireOwnEmployeeId", () => {
  it("resolves with the employeeId when the session has one", async () => {
    const req = await requestAs(employeeWithLink);
    const { employeeId } = await requireOwnEmployeeId(req);
    expect(employeeId).toBe("emp-1");
  });

  it("throws 403 when the session has no linked employeeId", async () => {
    const req = await requestAs(employeeNoLink);
    await expect(requireOwnEmployeeId(req)).rejects.toMatchObject({ status: 403 });
  });
});

describe("scopeToOwnEmployeeIfSelf", () => {
  it("returns forcedEmployeeId: null for admin/hr/manager (no forced scope)", async () => {
    const req = await requestAs(admin);
    const { forcedEmployeeId } = await scopeToOwnEmployeeIfSelf(req);
    expect(forcedEmployeeId).toBeNull();
  });

  it("returns the session's own employeeId for an employee-role session", async () => {
    const req = await requestAs(employeeWithLink);
    const { forcedEmployeeId } = await scopeToOwnEmployeeIfSelf(req);
    expect(forcedEmployeeId).toBe("emp-1");
  });

  it("throws 403 for an employee session with no linked employeeId", async () => {
    const req = await requestAs(employeeNoLink);
    await expect(scopeToOwnEmployeeIfSelf(req)).rejects.toMatchObject({ status: 403 });
  });
});

describe("requireSelfOrRole", () => {
  it("allows an elevated role for any target", async () => {
    const req = await requestAs(admin);
    await expect(requireSelfOrRole(req, "someone-elses-id", ["admin", "hr"])).resolves.toBeTruthy();
  });

  it("allows a matching self-target", async () => {
    const req = await requestAs(employeeWithLink);
    await expect(requireSelfOrRole(req, "emp-1", ["admin", "hr"])).resolves.toBeTruthy();
  });

  it("throws 403 for a non-elevated role targeting someone else", async () => {
    const req = await requestAs(employeeWithLink);
    await expect(requireSelfOrRole(req, "someone-elses-id", ["admin", "hr"])).rejects.toMatchObject({ status: 403 });
  });

  it("throws 403 for a role not in elevatedRoles even on its own target when unauthenticated context differs", async () => {
    // manager targeting someone else, with elevatedRoles excluding manager (e.g. salary-slip/form16 policy)
    const req = await requestAs(manager);
    await expect(requireSelfOrRole(req, "someone-elses-id", ["admin", "hr"])).rejects.toMatchObject({ status: 403 });
  });
});

describe("AuthError", () => {
  it("defaults to status 401", () => {
    const err = new AuthError("nope");
    expect(err.status).toBe(401);
  });
});

describe("pending face token", () => {
  it("round-trips a valid token", async () => {
    const token = await signPendingFaceToken("user-123");
    const result = await verifyPendingFaceToken(token);
    expect(result).toEqual({ userId: "user-123" });
  });

  it("rejects a tampered token", async () => {
    const token = await signPendingFaceToken("user-123");
    // Flip a character in the middle of the signature, not the last one — base64url's final
    // character group for a 256-bit HMAC signature only encodes 2 significant bits, so some
    // substitutions there decode to identical bytes and the tamper is silently a no-op. A
    // middle character is always a full 6-bit group, so this is a real, deterministic tamper.
    const mid = Math.floor(token.length / 2);
    const midChar = token[mid];
    const tampered = token.slice(0, mid) + (midChar === "a" ? "b" : "a") + token.slice(mid + 1);
    expect(await verifyPendingFaceToken(tampered)).toBeNull();
  });

  it("rejects garbage input", async () => {
    expect(await verifyPendingFaceToken("not-a-jwt")).toBeNull();
  });

  it("rejects a token with the wrong purpose (e.g. a real session token, same secret)", async () => {
    const sessionToken = await signSession(admin);
    expect(await verifyPendingFaceToken(sessionToken)).toBeNull();
  });

  it("rejects an expired token", async () => {
    vi.useFakeTimers();
    try {
      const token = await signPendingFaceToken("user-123");
      vi.setSystemTime(Date.now() + 6 * 60 * 1000); // 6 minutes later, past the 5-minute TTL
      expect(await verifyPendingFaceToken(token)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
