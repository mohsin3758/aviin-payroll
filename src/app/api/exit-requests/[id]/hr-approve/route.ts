import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePayrollFeature, assertEmployeeInScope } from "@/lib/payroll-access";
import { apiError, handleApiError } from "@/lib/api-utils";
import { approveExitRequestSchema } from "@/lib/validations/exit-request";
import { logAudit } from "@/lib/audit";
import { notifyEmployee } from "@/lib/notifications";

const DEFAULT_EXIT_CHECKLIST = [
  "Knowledge transfer completed",
  "Company assets returned",
  "No-dues clearance (Finance, IT, Admin)",
  "Access/credentials revoked",
  "Exit interview conducted",
];

// PUT /api/exit-requests/[id]/hr-approve — admin/hr only, final approval stage.
// On approval, seeds the standard exit checklist.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session, restriction } = await requirePayrollFeature(request, ["admin", "hr"], "manage_exit_management");
    const body = await request.json();
    const { approved, comment } = approveExitRequestSchema.parse(body);

    const existing = await db.exitRequest.findUnique({ where: { id } });
    if (!existing) return apiError("Exit request not found", 404);
    assertEmployeeInScope(restriction, existing.employeeId);
    if (existing.status !== "pending_hr") {
      return apiError(`This request is not awaiting HR approval (current status: ${existing.status}).`, 409);
    }

    const exitRequest = await db.$transaction(async (tx) => {
      const updated = await tx.exitRequest.update({
        where: { id },
        data: {
          status: approved ? "approved" : "rejected",
          hrApprovedBy: session.userId,
          hrApprovedAt: new Date(),
          hrComment: comment ?? null,
        },
      });

      if (approved) {
        await tx.exitChecklistItem.createMany({
          data: DEFAULT_EXIT_CHECKLIST.map((taskName, order) => ({ exitRequestId: id, taskName, order })),
        });
      }

      return updated;
    });

    await logAudit({ session, action: approved ? "approve" : "reject", entity: "ExitRequest", entityId: id, details: { stage: "hr" } });

    await notifyEmployee(existing.employeeId, {
      title: approved ? "Resignation approved" : "Resignation rejected",
      message: approved
        ? `Your resignation has been approved. Your last working day is ${exitRequest.lastWorkingDate.toLocaleDateString("en-IN")}.`
        : "Your resignation was not approved by HR.",
      category: "exit",
    });

    return NextResponse.json({ data: exitRequest });
  } catch (error) {
    return handleApiError(error, "process HR approval");
  }
}
