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
