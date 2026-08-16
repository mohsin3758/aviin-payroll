import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";
import { requirePayrollFeature, assertEmployeeInScope } from "@/lib/payroll-access";
import { logAudit } from "@/lib/audit";
import { notifyEmployee } from "@/lib/notifications";

// PUT /api/hiring-incentives/[id] — cancel a pending/eligible incentive before it's been paid.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, restriction } = await requirePayrollFeature(request, ["admin", "hr"], "manage_hiring_incentives");
    const { id } = await params;
    const body = await request.json();

    const existing = await db.hiringIncentive.findUnique({ where: { id } });
    if (!existing) {
      return apiError("Hiring incentive not found", 404);
    }
    assertEmployeeInScope(restriction, existing.recruiterId);
    if (existing.status === "paid") {
      return apiError("This hiring incentive has already been paid out and cannot be cancelled.", 409);
    }
    if (existing.status === "forfeited") {
      return apiError("This hiring incentive was already forfeited — there is nothing to cancel.", 409);
    }
    if (body.status !== "cancelled") {
      return apiError("Only cancelling a pending or eligible hiring incentive is supported here.", 400);
    }

    const incentive = await db.hiringIncentive.update({
      where: { id },
      data: { status: "cancelled" },
    });

    await logAudit({ session, action: "update", entity: "HiringIncentive", entityId: id, details: { toStatus: "cancelled" } });

    await notifyEmployee(existing.recruiterId, {
      title: "Hiring incentive cancelled",
      message: `Your ₹${existing.amount.toLocaleString("en-IN")} hiring incentive (pay month ${existing.payMonth}/${existing.payYear}) was cancelled.`,
      category: "general",
      link: "hiring-incentives",
    });

    return NextResponse.json(incentive);
  } catch (error) {
    return handleApiError(error, "update hiring incentive");
  }
}
