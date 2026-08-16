import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createLoanSchema } from "@/lib/validations/loan";
import { apiError, handleApiError } from "@/lib/api-utils";
import { requirePayrollFeature, requirePayrollSelfOrFeature, assertEmployeeInScope } from "@/lib/payroll-access";
import { logAudit } from "@/lib/audit";

// GET /api/loans?employeeId=...&status=... — includes computed remainingMonths per loan.
// Financial data, same tier as salary-slip/form16: self or admin/hr only, not manager. admin/hr
// callers are additionally subject to that user's configured payroll feature/employee
// restrictions, if any — see src/lib/payroll-access.ts.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const employeeId = searchParams.get("employeeId");
    const status = searchParams.get("status");

    let scopedEmployeeIds: string[] | null = null;
    if (employeeId) {
      await requirePayrollSelfOrFeature(request, employeeId, ["admin", "hr"], "manage_loans");
    } else {
      // No specific target requested — this is a company-wide listing, admin/hr only.
      const { restriction } = await requirePayrollFeature(request, ["admin", "hr"], "manage_loans");
      if (restriction.employeeIds) scopedEmployeeIds = [...restriction.employeeIds];
    }

    const where: Record<string, unknown> = {};
    if (employeeId) where.employeeId = employeeId;
    if (status) where.status = status;
    if (scopedEmployeeIds) where.employeeId = { in: scopedEmployeeIds };

    const loans = await db.employeeLoan.findMany({
      where,
      include: {
        employee: { select: { firstName: true, lastName: true, employeeCode: true } },
        _count: { select: { payments: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const data = loans.map((loan) => ({
      ...loan,
      paidMonths: loan._count.payments,
      remainingMonths: Math.max(0, loan.totalMonths - loan._count.payments),
    }));

    return NextResponse.json({ data });
  } catch (error) {
    return handleApiError(error, "fetch loans");
  }
}

// POST /api/loans — create a new loan/advance for an employee
export async function POST(request: NextRequest) {
  try {
    const { session, restriction } = await requirePayrollFeature(request, ["admin", "hr"], "manage_loans");
    const body = await request.json();
    const parsed = createLoanSchema.parse(body);
    assertEmployeeInScope(restriction, parsed.employeeId);

    const employee = await db.employee.findUnique({ where: { id: parsed.employeeId } });
    if (!employee) {
      return apiError("Employee not found.", 404);
    }
    if (employee.dateOfExit) {
      return apiError("Cannot create a loan for an exited employee.", 400);
    }

    const loan = await db.employeeLoan.create({
      data: parsed,
      include: {
        employee: { select: { firstName: true, lastName: true, employeeCode: true } },
      },
    });

    await logAudit({
      session,
      action: "create",
      entity: "EmployeeLoan",
      entityId: loan.id,
      details: { employeeId: parsed.employeeId, loanType: parsed.loanType, principal: parsed.principal, emiAmount: parsed.emiAmount },
    });

    return NextResponse.json({ ...loan, paidMonths: 0, remainingMonths: loan.totalMonths }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "create loan");
  }
}
