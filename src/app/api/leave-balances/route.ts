import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { createLeaveBalanceSchema } from "@/lib/validations/leave-balance";
import { logAudit } from "@/lib/audit";

// POST /api/leave-balances — admin/hr only. Manual one-off creation of a single employee's
// balance for a leave type/year, for corrections or new joiners outside the bulk-allocate flow
// (src/app/api/leave-types/[id]/allocate/route.ts). 409 if one already exists — use PUT instead.
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const body = await request.json();
    const parsed = createLeaveBalanceSchema.parse(body);

    const [employee, leaveType] = await Promise.all([
      db.employee.findUnique({ where: { id: parsed.employeeId } }),
      db.leaveType.findUnique({ where: { id: parsed.leaveTypeId } }),
    ]);
    if (!employee) return apiError("Employee not found", 404);
    if (!leaveType) return apiError("Leave type not found", 404);

    const existing = await db.leaveBalance.findUnique({
      where: { employeeId_leaveTypeId_year: { employeeId: parsed.employeeId, leaveTypeId: parsed.leaveTypeId, year: parsed.year } },
    });
    if (existing) {
      return apiError("A balance already exists for this employee/leave type/year — edit it instead.", 409);
    }

    const balance = await db.leaveBalance.create({ data: parsed, include: { leaveType: true } });
    await logAudit({ session, action: "create", entity: "LeaveBalance", entityId: balance.id, details: parsed });

    return NextResponse.json({ data: balance }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "create leave balance");
  }
}
