import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword, signSession, SESSION_COOKIE_NAME, SESSION_MAX_AGE } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { recordPunch } from "@/lib/attendance-punch";

// Email is normalized to lowercase before lookup — User.email is stored lowercase everywhere
// it's created, but this login is the one place a mismatch (e.g. someone typing their email
// exactly as capitalized on their profile page) would otherwise silently 401 with a correct
// password, since SQLite's default text comparison is case-sensitive.
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "local";
    const rl = checkRateLimit(`login:${ip}`, 10, 60_000);
    if (!rl.allowed) {
      return apiError("Too many login attempts. Try again in a minute.", 429);
    }

    const body = await request.json();
    const { email, password } = loginSchema.parse(body);

    const user = await db.user.findUnique({ where: { email } });
    if (!user || !user.active) {
      return apiError("Invalid email or password.", 401);
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return apiError("Invalid email or password.", 401);
    }

    const token = await signSession({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role as "admin" | "hr" | "manager" | "employee",
      employeeId: user.employeeId,
    });

    await logAudit({
      session: { userId: user.id, email: user.email, name: user.name, role: user.role as "admin" | "hr" | "manager" | "employee", employeeId: user.employeeId },
      action: "login",
      entity: "User",
      entityId: user.id,
      ipAddress: ip,
    });

    // Gap 6 fix: login-based attendance is opt-in (Company.enableLoginAttendance, default
    // false) and only applies to logins linked to an employee record. Never let a failure here
    // (including the very common "already punched in today") affect the login response itself.
    if (user.employeeId) {
      try {
        const company = await db.company.findFirst();
        if (company?.enableLoginAttendance) {
          await recordPunch({
            employeeId: user.employeeId,
            action: "in",
            method: "login",
            ipAddress: ip,
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
  } catch (error) {
    return handleApiError(error, "login");
  }
}
