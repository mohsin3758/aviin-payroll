import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { publicBaseUrl } from "@/lib/workforce/templates";

const schema = z.object({
  appSecret: z.string().trim().min(8).max(200).optional(),
  verifyToken: z.string().trim().min(8).max(200).optional(),
});

// GET — admin only. Never returns the secrets themselves, only whether each is set.
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ["admin"]);
    const company = await db.company.findFirst({ select: { whatsappAppSecret: true, whatsappVerifyToken: true } });
    return NextResponse.json({
      data: {
        appSecretSet: !!company?.whatsappAppSecret,
        verifyTokenSet: !!company?.whatsappVerifyToken,
        webhookUrl: `${publicBaseUrl()}/api/whatsapp/webhook`,
      },
    });
  } catch (error) {
    return handleApiError(error, "fetch webhook settings");
  }
}

// PUT — admin only. Stores the Meta app secret (verifies webhook signatures) and the verify token
// (answers Meta's setup handshake). Same plaintext-at-rest tradeoff as the existing WhatsApp token.
export async function PUT(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin"]);
    const body = schema.parse(await request.json());
    const company = await db.company.findFirst();
    if (!company) return apiError("No company configured.", 400);
    await db.company.update({
      where: { id: company.id },
      data: {
        ...(body.appSecret ? { whatsappAppSecret: body.appSecret } : {}),
        ...(body.verifyToken ? { whatsappVerifyToken: body.verifyToken } : {}),
      },
    });
    await logAudit({ session, action: "update_webhook_secrets", entity: "Company", entityId: company.id, details: { appSecret: !!body.appSecret, verifyToken: !!body.verifyToken } });
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    return handleApiError(error, "update webhook settings");
  }
}
