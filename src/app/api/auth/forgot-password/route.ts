import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { forgotPasswordSchema } from "@/lib/validations/password-reset";
import { generateResetToken, hashResetToken, newResetExpiry } from "@/lib/password-reset";
import { sendEmail } from "@/lib/mailer";
import { buildPasswordResetEmailHtml } from "@/lib/payroll/password-reset-email";
import { logAudit } from "@/lib/audit";

const GENERIC_MESSAGE = "If an account with that email exists, we've sent password reset instructions.";

// POST /api/auth/forgot-password — public (under the existing /api/auth/ middleware
// allow-list). Anti-enumeration is the entire point of this route: the response is always
// identical regardless of whether the email exists, is active, or the send succeeds — nothing
// about account existence is ever observable from the response shape or status code.
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "local";
    const rl = checkRateLimit(`forgot-password:${ip}`, 5, 60_000);
    if (!rl.allowed) {
      return apiError("Too many requests. Try again in a minute.", 429);
    }

    const body = await request.json();
    const { email } = forgotPasswordSchema.parse(body);

    const user = await db.user.findUnique({ where: { email } });
    if (user && user.active) {
      const rawToken = generateResetToken();
      await db.passwordResetToken.create({
        data: { userId: user.id, tokenHash: hashResetToken(rawToken), expiresAt: newResetExpiry() },
      });

      const resetUrl = `${request.nextUrl.origin}/reset-password/${rawToken}`;
      try {
        const company = await db.company.findFirst({ orderBy: { createdAt: "asc" } });
        const html = buildPasswordResetEmailHtml({
          userName: user.name,
          company: { name: company?.name ?? "PayrollPro" },
          resetUrl,
          expiresAt: newResetExpiry(),
        });
        await sendEmail({ to: user.email, subject: "Reset your password", html });
      } catch (emailError) {
        console.error("Failed to send password reset email:", emailError);
      }

      await logAudit({ session: null, action: "forgot-password-request", entity: "User", entityId: user.id, ipAddress: ip });
    }

    return NextResponse.json({ message: GENERIC_MESSAGE });
  } catch (error) {
    return handleApiError(error, "request password reset");
  }
}
