import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPassword, signPendingFaceToken } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { completeLogin } from "@/lib/complete-login";

// Email is normalized to lowercase before lookup — User.email is stored lowercase everywhere
// it's created, but this login is the one place a mismatch (e.g. someone typing their email
// exactly as capitalized on their profile page) would otherwise silently 401 with a correct
// password, since SQLite's default text comparison is case-sensitive.
const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  // Best-effort browser geolocation (src/lib/geolocation-client.ts) — only ever used to
  // geofence-check login-triggered auto-punch, never to gate the login itself.
  latitude: z.number().finite().nullable().optional(),
  longitude: z.number().finite().nullable().optional(),
  accuracy: z.number().finite().nullable().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "local";
    const rl = checkRateLimit(`login:${ip}`, 10, 60_000);
    if (!rl.allowed) {
      return apiError("Too many login attempts. Try again in a minute.", 429);
    }

    const body = await request.json();
    const { email, password, latitude, longitude, accuracy } = loginSchema.parse(body);

    const user = await db.user.findUnique({ where: { email } });
    if (!user || !user.active) {
      return apiError("Invalid email or password.", 401);
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return apiError("Invalid email or password.", 401);
    }

    // Company-wide mandatory face verification, layered on top of (never instead of) the
    // password just verified above. Only ever applies to logins linked to an Employee record —
    // a login with no employeeId has no FaceEnrollment to check against, so it's always exempt
    // (a deliberate safety valve: without it, an admin/HR account not linked to an employee
    // could lock itself out the moment this setting is turned on).
    const company = await db.company.findFirst();
    if (company?.requireFaceLogin && user.employeeId) {
      const enrollment = await db.faceEnrollment.findUnique({ where: { employeeId: user.employeeId } });
      const pendingToken = await signPendingFaceToken(user.id);
      return NextResponse.json({ requiresFaceVerification: true, pendingToken, enrolled: !!enrollment });
    }

    return completeLogin(user, { ipAddress: ip, latitude, longitude, accuracy });
  } catch (error) {
    return handleApiError(error, "login");
  }
}
