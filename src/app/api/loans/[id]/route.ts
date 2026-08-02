import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateLoanStatusSchema } from "@/lib/validations/loan";
import { apiError, handleApiError } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";

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

    const existing = await db.employeeLoan.findUnique({
      where: { id },
      include: { employee: { select: { user: { select: { id: true } } } } },
    });
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

    // Only a self-request being reviewed for the first time — not every later status change
    // (e.g. admin cancelling an already-active loan) — is worth pinging the employee about.
    if (existing.status === "pending" && (status === "active" || status === "rejected") && existing.employee.user) {
      await notify({
        userId: existing.employee.user.id,
        title: status === "active" ? "Loan/advance request approved" : "Loan/advance request rejected",
        message:
          status === "active"
            ? `Your ${loan.loanType} request for ₹${loan.principal.toLocaleString("en-IN")} was approved.`
            : `Your ${loan.loanType} request for ₹${loan.principal.toLocaleString("en-IN")} was rejected.`,
        category: "general",
        link: "my-portal",
      });
    }

    return NextResponse.json(loan);
  } catch (error) {
    return handleApiError(error, "update loan");
  }
}
