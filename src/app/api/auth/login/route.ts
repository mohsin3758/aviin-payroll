import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword, signSession, SESSION_COOKIE_NAME, SESSION_MAX_AGE } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";

const loginSchema = z.object({
  email: z.string().trim().email(),
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
