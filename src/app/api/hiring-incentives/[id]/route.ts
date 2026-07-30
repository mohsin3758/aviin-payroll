import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// PUT /api/hiring-incentives/[id] — cancel a pending/eligible incentive before it's been paid.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id } = await params;
    const body = await request.json();

    const existing = await db.hiringIncentive.findUnique({ where: { id } });
    if (!existing) {
      return apiError("Hiring incentive not found", 404);
    }
    if (existing.status === "paid") {
      return apiError("This hiring incentive has already been paid out and cannot be cancelled.", 409);
    }
    if (existing.status === "forfeited") {
      return apiError("This hiring incentive was already forfeited — there is nothing to cancel.", 409);
    }
    if (body.status !== "cancelled") {
      return apiError("Only cancelling a pending or eligible hiring incentive is supported here.", 400);
    }

    const incentive = await db.hiringIncentive.update({
      where: { id },
      data: { status: "cancelled" },
    });

    await logAudit({ session, action: "update", entity: "HiringIncentive", entityId: id, details: { toStatus: "cancelled" } });

    return NextResponse.json(incentive);
  } catch (error) {
    return handleApiError(error, "update hiring incentive");
  }
}
