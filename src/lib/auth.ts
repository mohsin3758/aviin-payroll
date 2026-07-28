import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";

// jose (not jsonwebtoken) is used deliberately: Next.js middleware runs on the Edge runtime,
// which lacks Node's `crypto` module that jsonwebtoken depends on. jose uses Web Crypto, so the
// same verification logic works identically in middleware and in Node API routes.
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-only-insecure-secret-change-me"
);
const SESSION_COOKIE = "payrollpro_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 hours

export type Role = "admin" | "hr" | "manager" | "employee";

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: Role;
  employeeId: string | null;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(JWT_SECRET);
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
export const SESSION_MAX_AGE = SESSION_TTL_SECONDS;

/** Reads and verifies the session from an incoming request's cookies. Returns null if absent/invalid. */
export async function getSession(request: NextRequest): Promise<SessionPayload | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

/** Throws AuthError(401) if no valid session. Use inside a try/catch that maps AuthError -> response. */
export async function requireAuth(request: NextRequest): Promise<SessionPayload> {
  const session = await getSession(request);
  if (!session) throw new AuthError("Unauthorized — please log in.", 401);
  return session;
}

/** Throws AuthError(401/403) if no session or role not permitted. */
export async function requireRole(request: NextRequest, allowed: Role[]): Promise<SessionPayload> {
  const session = await requireAuth(request);
  if (!allowed.includes(session.role)) {
    throw new AuthError(`Forbidden — requires role: ${allowed.join(" or ")}.`, 403);
  }
  return session;
}

/**
 * For the Employee Self-Service surface: requires a valid session AND that it's linked to an
 * Employee record, returning that employeeId. Used so ESS routes always derive "whose data is
 * this" from the session server-side — never from client-supplied input.
 */
export async function requireOwnEmployeeId(request: NextRequest): Promise<{ session: SessionPayload; employeeId: string }> {
  const session = await requireAuth(request);
  if (!session.employeeId) {
    throw new AuthError("Your login isn't linked to an employee record.", 403);
  }
  return { session, employeeId: session.employeeId };
}

/**
 * For list/collection endpoints (e.g. GET /api/leaves, GET /api/attendance) that today accept
 * an optional client-supplied employeeId filter with no ownership check. Returns the employeeId
 * an "employee" role caller's query must be silently forced to (ignoring any client-supplied
 * value) — null for admin/hr/manager, meaning "no forced scope, use whatever the caller asked
 * for." Mirrors the ESS routes' existing pattern instead of erroring, so an employee's own
 * requests to these shared routes keep working exactly as before, just narrowed to themselves.
 */
export async function scopeToOwnEmployeeIfSelf(request: NextRequest): Promise<{ session: SessionPayload; forcedEmployeeId: string | null }> {
  const session = await requireAuth(request);
  if (session.role === "employee") {
    if (!session.employeeId) {
      throw new AuthError("Your login isn't linked to an employee record.", 403);
    }
    return { session, forcedEmployeeId: session.employeeId };
  }
  return { session, forcedEmployeeId: null };
}

/**
 * For single-target action endpoints (e.g. DELETE /api/leaves/[id], POST /api/attendance/punch)
 * that name one specific employeeId. Passes for any role in elevatedRoles unconditionally, or
 * when the caller's own employeeId matches the named target exactly; otherwise 403 — no silent
 * redirect, since (unlike scopeToOwnEmployeeIfSelf) the caller named an explicit target.
 */
export async function requireSelfOrRole(request: NextRequest, targetEmployeeId: string, elevatedRoles: Role[]): Promise<SessionPayload> {
  const session = await requireAuth(request);
  if (elevatedRoles.includes(session.role)) {
    return session;
  }
  if (session.employeeId && session.employeeId === targetEmployeeId) {
    return session;
  }
  throw new AuthError("Forbidden — you may only access or act on your own record.", 403);
}
