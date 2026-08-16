import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePayrollFeature, assertEmployeeInScope } from "@/lib/payroll-access";
import { apiError, handleApiError } from "@/lib/api-utils";
import { editLeaveBalanceSchema } from "@/lib/validations/leave-balance";
import { logAudit } from "@/lib/audit";

// PUT /api/leave-balances/[id] — admin/hr only. A manual-correction escape hatch: editing
// `used` directly is explicitly supported (e.g. fixing a leave cancelled without reverting it,
// or a mis-applied encashment), not hidden — but always requires a `reason`, logged verbatim.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, restriction } = await requirePayrollFeature(request, ["admin", "hr"], "manage_leave_management");
    const { id } = await params;

    const existing = await db.leaveBalance.findUnique({ where: { id } });
    if (!existing) return apiError("Leave balance not found", 404);
    assertEmployeeInScope(restriction, existing.employeeId);

    const body = await request.json();
    const { reason, ...rest } = editLeaveBalanceSchema.parse(body);

    const balance = await db.leaveBalance.update({ where: { id }, data: rest, include: { leaveType: true } });
    await logAudit({
      session,
      action: "update",
      entity: "LeaveBalance",
      entityId: id,
      details: { reason, before: existing, after: rest },
    });

    return NextResponse.json({ data: balance });
  } catch (error) {
    return handleApiError(error, "update leave balance");
  }
}

// DELETE /api/leave-balances/[id] — admin/hr only. Only allowed when no leave has actually been
// taken against it (used === 0) — mirrors this app's existing "can't remove something with real
// history" guard pattern (e.g. the last-admin-account check on user deletion).
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, restriction } = await requirePayrollFeature(request, ["admin", "hr"], "manage_leave_management");
    const { id } = await params;

    const existing = await db.leaveBalance.findUnique({ where: { id } });
    if (!existing) return apiError("Leave balance not found", 404);
    assertEmployeeInScope(restriction, existing.employeeId);

    if (existing.used > 0) {
      return apiError("Cannot delete a balance that already has used leave against it.", 400);
    }

    await db.leaveBalance.delete({ where: { id } });
    await logAudit({ session, action: "delete", entity: "LeaveBalance", entityId: id, details: existing });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "delete leave balance");
  }
}
