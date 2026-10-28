import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { visibleClientAndProjectIds } from "@/lib/workforce/scope-server";
import { isFullAccess } from "@/lib/workforce/access";
import { monthRange } from "@/lib/workforce/month";
import { workforceError } from "@/lib/workforce/route-helpers";

const schema = z.object({
  projectId: z.string().min(1), year: z.number().int(), month: z.number().int().min(1).max(12),
  // Who at the client approved, and how (e.g. "email from Priya, 3 Dec").
  note: z.string().trim().min(5, "Record who approved and how").max(500),
});

// POST /api/workforce/month/signoff — staff record a sign-off the client gave outside the link
// (by email, say). The note is mandatory so the evidence trail is never empty.
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin", "hr", "manager"]);
    const body = schema.parse(await request.json());
    if (!isFullAccess(session.role) && !(await visibleClientAndProjectIds(session)).projectIds.has(body.projectId)) return apiError("Not found", 404);
    const { end } = monthRange(body.year, body.month);
    if (new Date() < end) return apiError("This month has not ended yet.", 409);
    if (await db.monthLock.findUnique({ where: { projectId_year_month: { projectId: body.projectId, year: body.year, month: body.month } } })) {
      return apiError("This month is already locked.", 409);
    }
    const row = await db.clientSignOff.upsert({
      where: { projectId_year_month: { projectId: body.projectId, year: body.year, month: body.month } },
      create: { projectId: body.projectId, year: body.year, month: body.month, status: "signed", signedAt: new Date(), note: `Recorded by staff: ${body.note}` },
      update: { status: "signed", signedAt: new Date(), note: `Recorded by staff: ${body.note}` },
    });
    await logAudit({ session, action: "record_signoff", entity: "ClientSignOff", entityId: row.id, details: body });
    return NextResponse.json({ data: { ok: true } });
  } catch (error) {
    return workforceError(error, "record sign-off");
  }
}
