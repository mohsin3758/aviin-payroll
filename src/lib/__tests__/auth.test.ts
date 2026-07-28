import { describe, it, expect } from "vitest";
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
