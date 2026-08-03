import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { signSession, SESSION_COOKIE_NAME, SESSION_MAX_AGE, type Role } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { recordPunch } from "@/lib/attendance-punch";

interface LoginUser {
  id: string;
  email: string;
  name: string;
  role: string;
  employeeId: string | null;
}

// The actual "grant a session" tail — shared by the plain password login, and (once verified)
// both face-login completion routes, so all three ways of finishing a login stay in lockstep
// instead of separately duplicating signSession/cookie/audit/login-attendance logic.
export async function completeLogin(
  user: LoginUser,
  opts: { ipAddress: string; auditAction?: string }
): Promise<NextResponse> {
  const role = user.role as Role;

  const token = await signSession({
    userId: user.id,
    email: user.email,
    name: user.name,
    role,
    employeeId: user.employeeId,
  });

  await logAudit({
    session: { userId: user.id, email: user.email, name: user.name, role, employeeId: user.employeeId },
    action: opts.auditAction ?? "login",
    entity: "User",
    entityId: user.id,
    ipAddress: opts.ipAddress,
  });

  // Gap 6 fix (pre-existing): login-based attendance is opt-in (Company.enableLoginAttendance,
  // default false) and only applies to logins linked to an employee record. Never let a failure
  // here (including the very common "already punched in today") affect the login response itself.
  if (user.employeeId) {
    try {
      const company = await db.company.findFirst();
      if (company?.enableLoginAttendance) {
        await recordPunch({
          employeeId: user.employeeId,
          action: "in",
          method: "login",
          ipAddress: opts.ipAddress,
        });
      }
    } catch (err) {
      console.error("[LOGIN_ATTENDANCE] Failed to auto-mark attendance on login:", err);
    }
  }

  const res = NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role, employeeId: user.employeeId },
  });
  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
  return res;
}
