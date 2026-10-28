import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { assertAssignmentAccess, workforceError } from "@/lib/workforce/route-helpers";

const schema = z.object({
  outcome: z.enum(["upheld", "rejected"]), // upheld = the client was right; rejected = the record stands
  resolution: z.string().trim().min(5, "Explain the decision").max(1000),
});

// PATCH /api/workforce/disputes/[id] — resolve a client or contractor dispute. This only records
// the decision; any change to the day itself goes through the audited correction flow, and payroll
// is never modified from here.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr", "manager"]);
    const { id } = await params;
    const dispute = await db.dispute.findUnique({ where: { id }, include: { dailyStatus: true } });
    if (!dispute) return apiError("Not found", 404);
    await assertAssignmentAccess(session, dispute.dailyStatus.assignmentId);
    if (dispute.status !== "open") return apiError("This dispute is already closed.", 409);

    const body = schema.parse(await request.json());
    const updated = await db.dispute.update({
      where: { id },
      data: { status: body.outcome === "upheld" ? "resolved" : "rejected", resolution: body.resolution, resolvedBy: session.userId, resolvedAt: new Date() },
    });
    // With no other open dispute on the day, the day's confirmation status is settled.
    const stillOpen = await db.dispute.count({ where: { dailyStatusId: dispute.dailyStatusId, status: "open" } });
    if (stillOpen === 0) {
      await db.dailyStatus.update({ where: { id: dispute.dailyStatusId }, data: { clientConfirm: "confirmed", clientConfirmNote: `Dispute resolved: ${body.resolution}`.slice(0, 500) } });
    }
    await logAudit({ session, action: "dispute_resolved", entity: "Dispute", entityId: id, details: body });
    return NextResponse.json({ data: updated });
  } catch (error) {
    return workforceError(error, "resolve dispute");
  }
}
