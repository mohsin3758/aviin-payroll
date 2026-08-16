import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePayrollFeature } from "@/lib/payroll-access";
import { apiError, handleApiError } from "@/lib/api-utils";
import { editLeaveTypeSchema } from "@/lib/validations/leave-type";
import { logAudit } from "@/lib/audit";

// PUT /api/leave-types/[id] — admin/hr only. Editing totalDays/isCarryForward/maxCarryForward
// only changes the policy default used by future allocations — it never touches already-
// allocated LeaveBalance rows (a balance is a ledger entry, not a live formula). Setting
// active:false is how a leave type is "removed" — there is no DELETE, since LeaveType carries
// real leave history (LeaveBalance/LeaveApplication) that must never disappear.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session } = await requirePayrollFeature(request, ["admin", "hr"], "manage_leave_management");
    const { id } = await params;

    const existing = await db.leaveType.findUnique({ where: { id } });
    if (!existing) return apiError("Leave type not found", 404);

    const body = await request.json();
    const parsed = editLeaveTypeSchema.parse(body);

    const leaveType = await db.leaveType.update({ where: { id }, data: parsed });
    await logAudit({ session, action: "update", entity: "LeaveType", entityId: id, details: parsed });

    return NextResponse.json({ data: leaveType });
  } catch (error) {
    return handleApiError(error, "update leave type");
  }
}
