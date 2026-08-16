import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createEncashmentSchema } from "@/lib/validations/encashment";
import { apiError, handleApiError } from "@/lib/api-utils";
import { requirePayrollFeature, assertEmployeeInScope } from "@/lib/payroll-access";
import { logAudit } from "@/lib/audit";

// POST /api/leaves/encashment — pay out unused leave balance beyond what can be carried
// forward as a one-time arrear, and remove those days from the balance so they aren't
// carried forward or taken as leave later.
export async function POST(request: NextRequest) {
  try {
    const { session, restriction } = await requirePayrollFeature(request, ["admin", "hr"], "manage_leave_management");
    const body = await request.json();
    const { employeeId, leaveTypeId, year, payMonth, payYear } = createEncashmentSchema.parse(body);
    assertEmployeeInScope(restriction, employeeId);

    const [employee, leaveType, balance] = await Promise.all([
      db.employee.findUnique({ where: { id: employeeId }, include: { salaryStructure: true } }),
      db.leaveType.findUnique({ where: { id: leaveTypeId } }),
      db.leaveBalance.findUnique({ where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } } }),
    ]);

    if (!employee) return apiError("Employee not found.", 404);
    if (!employee.salaryStructure) return apiError("Employee has no salary structure configured.", 400);
    if (!leaveType) return apiError("Leave type not found.", 404);
    if (!balance) return apiError("No leave balance found for this employee/leave type/year.", 404);

    const available = balance.totalAllocated + balance.carryForwarded - balance.used;
    // Days beyond what's allowed to carry forward are the encashable portion.
    const encashableDays = Math.max(0, available - leaveType.maxCarryForward);

    if (encashableDays <= 0) {
      return apiError(
        `No encashable balance — ${available} day(s) available, all within the ${leaveType.maxCarryForward}-day carry-forward limit.`,
        400
      );
    }

    const perDayRate = (employee.salaryStructure.basic + employee.salaryStructure.dearnessAllowance) / 30;
    const amount = Math.round(perDayRate * encashableDays);

    const arrear = await db.$transaction(async (tx) => {
      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: { used: { increment: encashableDays } },
      });

      return tx.salaryArrear.create({
        data: {
          employeeId,
          amount,
          reason: `Leave encashment: ${encashableDays} day(s) of ${leaveType.name} (${year})`,
          payMonth,
          payYear,
        },
      });
    });

    await logAudit({
      session,
      action: "create",
      entity: "SalaryArrear",
      entityId: arrear.id,
      details: { type: "leave_encashment", employeeId, leaveTypeId, encashableDays, amount },
    });

    return NextResponse.json({ ...arrear, encashableDays, perDayRate }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "process leave encashment");
  }
}
