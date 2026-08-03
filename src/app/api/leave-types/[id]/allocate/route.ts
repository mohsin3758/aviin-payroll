import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError, getDefaultCompanyId, handleApiError } from "@/lib/api-utils";
import { allocateLeaveTypeSchema } from "@/lib/validations/leave-type";
import { logAudit } from "@/lib/audit";
import { ACTIVE_EMPLOYEE_WHERE } from "@/lib/employee-scope";
import { computeProratedAllocation, computeCarryForward } from "@/lib/leave/allocation";

interface AllocateResult {
  employeeId: string;
  status: "allocated" | "skipped" | "failed";
  totalAllocated?: number;
  carryForwarded?: number;
  error?: string;
}

// POST /api/leave-types/[id]/allocate { year } — admin/hr only. Bulk-creates a LeaveBalance row
// for every active employee who doesn't already have one for this (employee, leaveType, year),
// pro-rating for mid-year joiners and rolling forward unused days from the prior year per the
// leave type's own carry-forward policy. One bad record can't abort the whole batch — see
// src/app/api/form16/send-bulk/route.ts for the same per-item BulkResult convention.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id: leaveTypeId } = await params;

    const leaveType = await db.leaveType.findUnique({ where: { id: leaveTypeId } });
    if (!leaveType) return apiError("Leave type not found", 404);

    const body = await request.json();
    const { year } = allocateLeaveTypeSchema.parse(body);

    const companyId = await getDefaultCompanyId();
    const employees = await db.employee.findMany({
      where: { companyId, ...ACTIVE_EMPLOYEE_WHERE },
      select: { id: true, dateOfJoining: true },
    });

    const existingBalances = await db.leaveBalance.findMany({
      where: { leaveTypeId, year, employeeId: { in: employees.map((e) => e.id) } },
    });
    const alreadyAllocated = new Set(existingBalances.map((b) => b.employeeId));

    const priorYearBalances = await db.leaveBalance.findMany({
      where: { leaveTypeId, year: year - 1, employeeId: { in: employees.map((e) => e.id) } },
    });
    const priorByEmployee = new Map(priorYearBalances.map((b) => [b.employeeId, b]));

    const results = await Promise.allSettled(
      employees.map(async (emp): Promise<AllocateResult> => {
        if (alreadyAllocated.has(emp.id)) {
          return { employeeId: emp.id, status: "skipped", error: "Balance already exists for this year" };
        }

        const totalAllocated = computeProratedAllocation(leaveType.totalDays, emp.dateOfJoining, year);
        const prior = priorByEmployee.get(emp.id) ?? null;
        const carryForwarded = computeCarryForward(leaveType, prior);

        await db.leaveBalance.create({
          data: { employeeId: emp.id, leaveTypeId, year, totalAllocated, carryForwarded },
        });

        return { employeeId: emp.id, status: "allocated", totalAllocated, carryForwarded };
      })
    );

    const rows = results.map((r) =>
      r.status === "fulfilled"
        ? r.value
        : ({ employeeId: "unknown", status: "failed", error: "Unexpected error" } as AllocateResult)
    );

    const summary = {
      total: rows.length,
      allocated: rows.filter((r) => r.status === "allocated").length,
      skipped: rows.filter((r) => r.status === "skipped").length,
      failed: rows.filter((r) => r.status === "failed").length,
      results: rows,
    };

    await logAudit({
      session,
      action: "create",
      entity: "LeaveBalance",
      entityId: leaveTypeId,
      details: { bulkAllocate: true, leaveTypeName: leaveType.name, year, ...summary, results: undefined },
    });

    return NextResponse.json(summary);
  } catch (error) {
    return handleApiError(error, "allocate leave balances");
  }
}
