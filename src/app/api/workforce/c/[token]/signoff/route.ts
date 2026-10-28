import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { resolveActionToken } from "@/lib/workforce/tokens";
import { logAudit } from "@/lib/audit";
import { workforceError } from "@/lib/workforce/route-helpers";
import { apiError } from "@/lib/api-utils";
import { monthRange } from "@/lib/workforce/month";

const schema = z.object({ year: z.number().int(), month: z.number().int().min(1).max(12), note: z.string().trim().max(500).optional() });

// POST /api/workforce/c/[token]/signoff — the client representative approves a finished month.
// Only for a month that has ended, and not while any day in it is still disputed. Once the month
// is locked the sign-off can no longer be changed.
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const t = await resolveActionToken(token, "client");
    if (!t.contactId || !t.projectId) return apiError("This link is invalid or has expired.", 404);
    const body = schema.parse(await request.json());
    const { end } = monthRange(body.year, body.month);
    if (new Date() < end) return apiError("This month has not ended yet.", 409);

    if (await db.monthLock.findUnique({ where: { projectId_year_month: { projectId: t.projectId, year: body.year, month: body.month } } })) {
      return apiError("This month is already locked.", 409);
    }
    const { start } = monthRange(body.year, body.month);
    const open = await db.dispute.count({ where: { status: "open", dailyStatus: { date: { gte: start, lt: end }, assignment: { projectId: t.projectId, clientRepContactId: t.contactId } } } });
    if (open > 0) return apiError(`${open} day(s) in this month are still disputed. They must be resolved before sign-off.`, 409);

    const row = await db.clientSignOff.upsert({
      where: { projectId_year_month: { projectId: t.projectId, year: body.year, month: body.month } },
      create: { projectId: t.projectId, year: body.year, month: body.month, status: "signed", signedByContactId: t.contactId, signedAt: new Date(), note: body.note ?? null },
      update: { status: "signed", signedByContactId: t.contactId, signedAt: new Date(), note: body.note ?? null },
    });
    await logAudit({ session: null, action: "client_signoff", entity: "ClientSignOff", entityId: row.id, details: { by: `client:${t.contactId}`, year: body.year, month: body.month } });
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    return workforceError(error, "client sign-off");
  }
}
