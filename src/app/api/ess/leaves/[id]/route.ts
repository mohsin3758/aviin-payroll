import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOwnEmployeeId } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

// DELETE /api/ess/leaves/[id] — cancel one of the CURRENT user's own leave applications.
// (The shared /api/leaves/[id] cancel route has no ownership check at all — this dedicated
// ESS route exists specifically so a self-service cancel can never target someone else's leave.)
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, employeeId } = await requireOwnEmployeeId(request);
    const { id } = await params;

    const existing = await db.leaveApplication.findUnique({ where: { id } });
    if (!existing || existing.employeeId !== employeeId) {
      return apiError("Leave application not found", 404);
    }
    if (existing.status === "cancelled") {
      return apiError("This leave application is already cancelled.", 409);
    }

    const wasApproved = existing.status === "approved";

    const cancelled = await db.$transaction(async (tx) => {
      const updated = await tx.leaveApplication.update({
        where: { id },
        data: { status: "cancelled" },
        include: { leaveType: true },
      });

      if (wasApproved) {
        const year = updated.startDate.getFullYear();
        await tx.leaveBalance.updateMany({
          where: { employeeId: updated.employeeId, leaveTypeId: updated.leaveTypeId, year },
          data: { used: { decrement: updated.totalDays } },
        });
      }

      return updated;
    });

    await logAudit({ session, action: "cancel", entity: "LeaveApplication", entityId: id, details: { self: true, restoredBalance: wasApproved, days: existing.totalDays } });

    return NextResponse.json({ data: cancelled });
  } catch (error) {
    return handleApiError(error, "cancel own leave application");
  }
}
