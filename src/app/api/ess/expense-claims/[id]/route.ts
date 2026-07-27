import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOwnEmployeeId } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";

// DELETE /api/ess/expense-claims/[id] — withdraw one of the CURRENT user's own claims,
// only while it's still pending (nothing to undo once approved/paid).
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { employeeId } = await requireOwnEmployeeId(request);
    const { id } = await params;

    const existing = await db.expenseClaim.findUnique({ where: { id } });
    if (!existing || existing.employeeId !== employeeId) {
      return apiError("Expense claim not found", 404);
    }
    if (existing.status !== "pending") {
      return apiError(`Cannot withdraw a claim that is already ${existing.status}.`, 409);
    }

    await db.expenseClaim.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "withdraw expense claim");
  }
}
