import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { getEffectiveWhatsappConfig, sendWhatsappTemplate, WhatsappSendError } from "@/lib/whatsapp";

const testWhatsappSchema = z.object({
  to: z.string().trim().regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number"),
});

// POST /api/settings/test-whatsapp — admin only. Sends the configured leave-approval template
// with placeholder values, so the admin can verify their Meta Cloud API config — and that the
// template is actually approved — before relying on it for real leave approvals.
export async function POST(request: NextRequest) {
  try {
    await requireRole(request, ["admin"]);
    const body = await request.json();
    const { to } = testWhatsappSchema.parse(body);

    const config = await getEffectiveWhatsappConfig();
    if (!config) {
      return apiError("WhatsApp isn't configured yet — save your WhatsApp settings below first, then send the test.", 400);
    }

    const result = await sendWhatsappTemplate(config, to, [
      "Test Employee", "Casual Leave", "01 Jan 2026", "01 Jan 2026", "1", "Test Admin",
    ]);

    return NextResponse.json({ success: true, messageId: result.messageId });
  } catch (error) {
    if (error instanceof WhatsappSendError) {
      return apiError(`WhatsApp send failed: ${error.message}`, 502);
    }
    return handleApiError(error, "send test WhatsApp message");
  }
}
