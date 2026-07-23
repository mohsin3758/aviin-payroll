import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateLoanStatusSchema } from "@/lib/validations/loan";
import { apiError, handleApiError } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// PUT /api/loans/[id] — change status (e.g. cancel an active loan before any EMI is deducted)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id } = await params;
    const body = await request.json();
    const { status } = updateLoanStatusSchema.parse(body);

    const existing = await db.employeeLoan.findUnique({ where: { id } });
    if (!existing) {
      return apiError("Loan not found", 404);
    }

    const loan = await db.employeeLoan.update({
      where: { id },
      data: { status },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeCode: true } },
      },
    });

    await logAudit({
      session,
      action: "update",
      entity: "EmployeeLoan",
      entityId: id,
      details: { fromStatus: existing.status, toStatus: status },
    });

    return NextResponse.json(loan);
  } catch (error) {
    return handleApiError(error, "update loan");
  }
}
