import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOwnEmployeeId } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { createExpenseClaimSchema } from "@/lib/validations/expense-claim";
import { logAudit } from "@/lib/audit";
import { notifyRoles } from "@/lib/notifications";

// GET /api/ess/expense-claims — the current user's own expense claims.
export async function GET(request: NextRequest) {
  try {
    const { employeeId } = await requireOwnEmployeeId(request);
    const claims = await db.expenseClaim.findMany({
      where: { employeeId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ data: claims });
  } catch (error) {
    return handleApiError(error, "fetch own expense claims");
  }
}

// POST /api/ess/expense-claims — submit a new reimbursement claim for the current user.
export async function POST(request: NextRequest) {
  try {
    const { session, employeeId } = await requireOwnEmployeeId(request);
    const body = await request.json();
    const parsed = createExpenseClaimSchema.parse(body);

    const claim = await db.expenseClaim.create({ data: { employeeId, ...parsed } });

    await logAudit({ session, action: "create", entity: "ExpenseClaim", entityId: claim.id, details: { self: true, amount: parsed.amount } });

    await notifyRoles(["admin", "hr"], {
      title: "New expense claim",
      message: `${session.name} submitted a ${parsed.category} claim for ₹${parsed.amount.toLocaleString("en-IN")}`,
      category: "general",
    });

    return NextResponse.json({ data: claim }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "submit expense claim");
  }
}
