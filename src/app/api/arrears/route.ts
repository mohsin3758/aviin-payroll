import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createArrearSchema } from "@/lib/validations/arrear";
import { apiError, handleApiError } from "@/lib/api-utils";
import { requirePayrollFeature, requirePayrollSelfOrFeature, assertEmployeeInScope } from "@/lib/payroll-access";
import { logAudit } from "@/lib/audit";

// GET /api/arrears?employeeId=...&status=... — financial data (arrears/recoveries), same
// tier as loans/investment-declarations: self or admin/hr only, not manager. admin/hr callers
// are additionally subject to that user's configured payroll feature/employee restrictions,
// if any — see src/lib/payroll-access.ts.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const employeeId = searchParams.get("employeeId");
    const status = searchParams.get("status");

    let scopedEmployeeIds: string[] | null = null;
    if (employeeId) {
      await requirePayrollSelfOrFeature(request, employeeId, ["admin", "hr"], "manage_arrears");
    } else {
      const { restriction } = await requirePayrollFeature(request, ["admin", "hr"], "manage_arrears");
      if (restriction.employeeIds) scopedEmployeeIds = [...restriction.employeeIds];
    }

    const where: Record<string, unknown> = {};
    if (employeeId) where.employeeId = employeeId;
    if (status) where.status = status;
    if (scopedEmployeeIds) where.employeeId = { in: scopedEmployeeIds };

    const arrears = await db.salaryArrear.findMany({
      where,
      include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: arrears });
  } catch (error) {
    return handleApiError(error, "fetch arrears");
  }
}

// POST /api/arrears — schedule a one-time earning (retroactive correction) into a future/current
// month's payroll. Not prorated by attendance — the full amount is paid in that run.
export async function POST(request: NextRequest) {
  try {
    const { session, restriction } = await requirePayrollFeature(request, ["admin", "hr"], "manage_arrears");
    const body = await request.json();
    const parsed = createArrearSchema.parse(body);
    assertEmployeeInScope(restriction, parsed.employeeId);

    const employee = await db.employee.findUnique({ where: { id: parsed.employeeId } });
    if (!employee) {
      return apiError("Employee not found.", 404);
    }
    if (employee.dateOfExit) {
      return apiError("Cannot schedule an arrear for an exited employee.", 400);
    }

    const arrear = await db.salaryArrear.create({
      data: parsed,
      include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
    });

    await logAudit({
      session,
      action: "create",
      entity: "SalaryArrear",
      entityId: arrear.id,
      details: { employeeId: parsed.employeeId, amount: parsed.amount, payMonth: parsed.payMonth, payYear: parsed.payYear },
    });

    return NextResponse.json(arrear, { status: 201 });
  } catch (error) {
    return handleApiError(error, "create arrear");
  }
}
