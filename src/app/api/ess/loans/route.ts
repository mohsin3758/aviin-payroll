import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOwnEmployeeId } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { requestLoanSchema } from "@/lib/validations/loan";
import { logAudit } from "@/lib/audit";
import { notifyRoles } from "@/lib/notifications";

// GET /api/ess/loans — the current user's own loans/advances, with computed remaining months.
export async function GET(request: NextRequest) {
  try {
    const { employeeId } = await requireOwnEmployeeId(request);

    const loans = await db.employeeLoan.findMany({
      where: { employeeId },
      include: { _count: { select: { payments: true } } },
      orderBy: { createdAt: "desc" },
    });

    const data = loans.map((loan) => ({
      ...loan,
      paidMonths: loan._count.payments,
      remainingMonths: Math.max(0, loan.totalMonths - loan._count.payments),
    }));

    return NextResponse.json({ data });
  } catch (error) {
    return handleApiError(error, "fetch own loans");
  }
}

// POST /api/ess/loans — request a new loan/advance for yourself. Created as "pending" —
// admin/hr review and either approve it (flips to "active", picked up by the next payroll
// run) or reject it. Never auto-active, so nothing gets deducted before someone signs off.
export async function POST(request: NextRequest) {
  try {
    const { session, employeeId } = await requireOwnEmployeeId(request);
    const body = await request.json();
    const parsed = requestLoanSchema.parse(body);

    const employee = await db.employee.findUnique({ where: { id: employeeId } });
    if (!employee || employee.dateOfExit) {
      return apiError("Cannot request a loan for an exited employee.", 400);
    }

    const existingPending = await db.employeeLoan.findFirst({ where: { employeeId, status: "pending" } });
    if (existingPending) {
      return apiError("You already have a loan/advance request pending review.", 409);
    }

    const now = new Date();
    const startMonth = now.getMonth() === 11 ? 1 : now.getMonth() + 2;
    const startYear = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
    const emiAmount = Math.round((parsed.principal / parsed.totalMonths) * 100) / 100;

    const loan = await db.employeeLoan.create({
      data: {
        employeeId,
        loanType: parsed.loanType,
        principal: parsed.principal,
        emiAmount,
        totalMonths: parsed.totalMonths,
        startMonth,
        startYear,
        status: "pending",
        reason: parsed.reason ?? null,
      },
    });

    await logAudit({ session, action: "create", entity: "EmployeeLoan", entityId: loan.id, details: { selfRequested: true } });

    await notifyRoles(["admin", "hr"], {
      title: "New loan/advance request",
      message: `${employee.firstName} ${employee.lastName ?? ""} requested a ${parsed.loanType} of ${parsed.principal}`,
      category: "general",
      link: "employees",
    });

    return NextResponse.json({ data: loan }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "request loan");
  }
}
