import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOwnEmployeeId } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";

// DELETE /api/ess/loans/[id] — withdraw one of the CURRENT user's own loan/advance requests,
// only while it's still pending (nothing to undo once approved/rejected) — mirrors expense
// claims' self-withdraw, and is the only way to clear the "one pending request at a time"
// limit in POST /api/ess/loans without waiting on HR.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { employeeId } = await requireOwnEmployeeId(request);
    const { id } = await params;

    const existing = await db.employeeLoan.findUnique({ where: { id } });
    if (!existing || existing.employeeId !== employeeId) {
      return apiError("Loan/advance request not found", 404);
    }
    if (existing.status !== "pending") {
      return apiError(`Cannot withdraw a request that is already ${existing.status}.`, 409);
    }

    await db.employeeLoan.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "withdraw loan request");
  }
}
