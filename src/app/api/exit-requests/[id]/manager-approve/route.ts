import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { approveExitRequestSchema } from "@/lib/validations/exit-request";
import { logAudit } from "@/lib/audit";
import { notifyEmployee, notifyRoles } from "@/lib/notifications";

// PUT /api/exit-requests/[id]/manager-approve — manager/admin/hr, first approval stage.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr", "manager"]);
    const { id } = await params;
    const body = await request.json();
    const { approved, comment } = approveExitRequestSchema.parse(body);

    const existing = await db.exitRequest.findUnique({ where: { id } });
    if (!existing) return apiError("Exit request not found", 404);
    if (existing.status !== "pending_manager") {
      return apiError(`This request is not awaiting manager approval (current status: ${existing.status}).`, 409);
    }

    const exitRequest = await db.exitRequest.update({
      where: { id },
      data: {
        status: approved ? "pending_hr" : "rejected",
        managerApprovedBy: session.userId,
        managerApprovedAt: new Date(),
        managerComment: comment ?? null,
      },
    });

    await logAudit({ session, action: approved ? "approve" : "reject", entity: "ExitRequest", entityId: id, details: { stage: "manager" } });

    if (approved) {
      await notifyRoles(["admin", "hr"], { title: "Exit request needs HR approval", message: "A resignation has cleared manager approval", category: "exit", link: "exit-management" });
    } else {
      await notifyEmployee(existing.employeeId, { title: "Resignation rejected", message: "Your resignation was not approved by your manager.", category: "exit" });
    }

    return NextResponse.json({ data: exitRequest });
  } catch (error) {
    return handleApiError(error, "process manager approval");
  }
}
