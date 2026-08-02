import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { notifyEmployee } from "@/lib/notifications";

// PUT /api/exit-requests/[id]/final-settlement/finalize — admin/hr only. Locks the settlement
// and marks the employee as exited (sets Employee.dateOfExit). This is the actual offboarding
// completion step — irreversible through the API by design, matching how a "paid" payroll run
// is locked.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id } = await params;

    const exitRequest = await db.exitRequest.findUnique({ where: { id } });
    if (!exitRequest) return apiError("Exit request not found", 404);

    const settlement = await db.finalSettlement.findUnique({ where: { exitRequestId: id } });
    if (!settlement) return apiError("Compute the final settlement before finalizing.", 400);
    if (settlement.status !== "draft") {
      return apiError(`This settlement is already ${settlement.status}.`, 409);
    }

    const incompleteTasks = await db.exitChecklistItem.count({ where: { exitRequestId: id, isCompleted: false } });
    if (incompleteTasks > 0) {
      return apiError(`${incompleteTasks} exit checklist item(s) are still incomplete.`, 409);
    }

    const [finalized] = await db.$transaction([
      db.finalSettlement.update({ where: { id: settlement.id }, data: { status: "finalized", finalizedBy: session.userId, finalizedAt: new Date() } }),
      db.employee.update({ where: { id: exitRequest.employeeId }, data: { dateOfExit: exitRequest.lastWorkingDate } }),
    ]);

    await logAudit({ session, action: "update", entity: "FinalSettlement", entityId: settlement.id, details: { finalized: true } });

    await notifyEmployee(exitRequest.employeeId, {
      title: "Full and final settlement finalized",
      message: `Your full and final settlement of ₹${settlement.netSettlementAmount.toLocaleString("en-IN")} has been finalized. Your exit is now complete.`,
      category: "exit",
    });

    return NextResponse.json({ data: finalized });
  } catch (error) {
    return handleApiError(error, "finalize settlement");
  }
}
