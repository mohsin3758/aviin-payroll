import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOwnEmployeeId } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";

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
