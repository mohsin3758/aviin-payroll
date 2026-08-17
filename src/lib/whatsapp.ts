import { db } from '@/lib/db';

export interface EffectiveWhatsappConfig {
  phoneNumberId: string;
  accessToken: string;
  leaveApprovalTemplate: string;
  templateLanguage: string;
}

/**
 * Resolves the WhatsApp Cloud API config, same "admin-configured via Settings, no VPS/env access
 * needed" pattern as src/lib/mailer.ts's getEffectiveSmtpConfig. Returns null if not enabled or
 * incompletely configured — callers treat that as "WhatsApp isn't set up yet," not an error.
 */
export async function getEffectiveWhatsappConfig(): Promise<EffectiveWhatsappConfig | null> {
  const company = await db.company.findFirst({ orderBy: { createdAt: "asc" } });
  if (!company?.whatsappEnabled || !company.whatsappPhoneNumberId || !company.whatsappAccessToken) {
    return null;
  }
  return {
    phoneNumberId: company.whatsappPhoneNumberId,
    accessToken: company.whatsappAccessToken,
    leaveApprovalTemplate: company.whatsappLeaveApprovalTemplate || "leave_approved",
    templateLanguage: company.whatsappTemplateLanguage || "en_US",
  };
}

/** Employee.phone is stored as a bare 10-digit Indian mobile number — the Cloud API needs the
 * full E.164-style number (country code, no "+", no separators). India-only, matching every
 * other India-specific assumption already baked into this app (PAN/Aadhaar/PF/ESI/IFSC formats). */
export function toWhatsappNumber(indianMobile: string): string {
  const digits = indianMobile.replace(/\D/g, "");
  return digits.startsWith("91") ? digits : `91${digits}`;
}

export class WhatsappSendError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(message);
  }
}

/**
 * Sends a pre-approved WhatsApp template message via Meta's Cloud API. `params` are the
 * template's positional body variables ({{1}}, {{2}}, ...) in order, as plain text. Any business-
 * initiated message (like a leave-approval notice — the employee didn't message first) MUST use
 * an approved template; free-form text only works inside a 24h customer-service window, which
 * doesn't apply here.
 */
export async function sendWhatsappTemplate(
  config: EffectiveWhatsappConfig,
  to: string,
  params: string[]
): Promise<{ messageId: string }> {
  const res = await fetch(`https://graph.facebook.com/v21.0/${config.phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toWhatsappNumber(to),
      type: "template",
      template: {
        name: config.leaveApprovalTemplate,
        language: { code: config.templateLanguage },
        components: [
          {
            type: "body",
            parameters: params.map((text) => ({ type: "text", text })),
          },
        ],
      },
    }),
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new WhatsappSendError(body?.error?.message || `WhatsApp send failed (${res.status})`, body);
  }
  return { messageId: body?.messages?.[0]?.id ?? "unknown" };
}
