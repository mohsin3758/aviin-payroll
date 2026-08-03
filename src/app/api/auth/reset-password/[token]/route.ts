import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { hashPassword } from "@/lib/auth";
import { resolveResetToken } from "@/lib/password-reset";
import { resetPasswordSchema } from "@/lib/validations/user";
import { logAudit } from "@/lib/audit";

// GET /api/auth/reset-password/[token] — public. Lets the frontend show "checking link..." ->
// valid form or "link invalid" immediately on page load, without a second implementation of
// the validity check — this and POST below both call the same resolveResetToken(). Returns a
// boolean only, never a reason (nonexistent vs expired vs used all look identical).
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const record = await resolveResetToken(token);
    return NextResponse.json({ valid: !!record });
  } catch (error) {
    return handleApiError(error, "check password reset link");
  }
}

// POST /api/auth/reset-password/[token] — public. Body: { newPassword }. Single-use: marks
// the token usedAt rather than deleting it (keeps an audit trail, matches this codebase's
// general status-flag-over-deletion convention). Never signs a session — no auto-login; the
// user signs in normally afterward with the new password.
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "local";
    const rl = checkRateLimit(`reset-password:${ip}`, 10, 60_000);
    if (!rl.allowed) {
      return apiError("Too many attempts. Try again in a minute.", 429);
    }

    const { token } = await params;
    const body = await request.json();
    const { newPassword } = resetPasswordSchema.parse(body);

    const record = await resolveResetToken(token);
    if (!record) {
      return apiError("This reset link is invalid or has expired.", 400);
    }

    const passwordHash = await hashPassword(newPassword);
    await db.$transaction([
      db.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ]);

    await logAudit({ session: null, action: "reset-password", entity: "User", entityId: record.userId, ipAddress: ip });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "reset password");
  }
}
