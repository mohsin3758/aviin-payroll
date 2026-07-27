import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { sendEmail, getEffectiveSmtpConfig } from "@/lib/mailer";

const testEmailSchema = z.object({ to: z.string().trim().email() });

// POST /api/settings/test-email — admin only. Sends a test email using whatever SMTP config is
// currently effective (saved Settings, else env vars, else Ethereal) so the admin can verify
// their configuration actually works before relying on it.
export async function POST(request: NextRequest) {
  try {
    await requireRole(request, ["admin"]);
    const body = await request.json();
    const { to } = testEmailSchema.parse(body);

    const config = await getEffectiveSmtpConfig();
    if (!config) {
      return apiError("No SMTP configured yet — save your SMTP settings below first, then send the test.", 400);
    }

    const result = await sendEmail({
      to,
      subject: "PayrollPro — Test Email",
      html: `<div style="font-family:Arial,sans-serif;"><h2 style="color:#059669;">It works!</h2><p>This is a test email from PayrollPro, sent via <strong>${config.host}</strong>.</p><p>If you received this, your SMTP configuration is working correctly.</p></div>`,
    });

    return NextResponse.json({ success: true, messageId: result.messageId });
  } catch (error) {
    return handleApiError(error, "send test email");
  }
}
