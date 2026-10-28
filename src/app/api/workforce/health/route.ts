import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { getEffectiveWhatsappConfig } from "@/lib/whatsapp";

// GET /api/workforce/health — admin/hr. Is the automation running, and is anything failing?
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ["admin", "hr"]);
    const since = new Date(Date.now() - 24 * 3_600_000);
    const [beat, openExceptions, msgGroups, company, enabledFlags] = await Promise.all([
      db.workerHeartbeat.findUnique({ where: { id: "worker" } }),
      db.exceptionCase.count({ where: { status: { notIn: ["resolved", "dismissed"] } } }),
      db.workforceMessage.groupBy({ by: ["status"], where: { createdAt: { gte: since }, direction: "out" }, _count: true }),
      db.company.findFirst({ select: { whatsappEnabled: true, whatsappPhoneNumberId: true, whatsappAppSecret: true, whatsappVerifyToken: true } }),
      db.featureFlag.findMany({ where: { enabled: true }, select: { key: true, scopeKey: true } }),
    ]);
    const secondsSinceTick = beat ? Math.round((Date.now() - beat.lastTickAt.getTime()) / 1000) : null;
    return NextResponse.json({
      data: {
        worker: {
          lastTickAt: beat?.lastTickAt ?? null,
          secondsSinceTick,
          running: secondsSinceTick !== null && secondsSinceTick < 300,
          lastTickMs: beat?.lastTickMs ?? null,
          lastError: beat?.lastError ?? null,
          tickCount: beat?.tickCount ?? 0,
        },
        openExceptions,
        messagesLast24h: Object.fromEntries(msgGroups.map((g) => [g.status, g._count])),
        whatsapp: {
          configured: !!(await getEffectiveWhatsappConfig()),
          companyEnabled: !!company?.whatsappEnabled,
          webhookReady: !!(company?.whatsappAppSecret && company?.whatsappVerifyToken),
        },
        enabledFlags,
      },
    });
  } catch (error) {
    return handleApiError(error, "workforce health");
  }
}
