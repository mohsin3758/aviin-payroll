import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOwnEmployeeId } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { refreshPendingHiringIncentiveVesting } from "@/lib/payroll/hiring-incentive";

// GET /api/ess/hiring-incentives — the current user's own hiring incentives as a recruiter,
// read-only. No rates or candidate-management exposed here.
export async function GET(request: NextRequest) {
  try {
    const { employeeId } = await requireOwnEmployeeId(request);
    await refreshPendingHiringIncentiveVesting();

    const incentives = await db.hiringIncentive.findMany({
      where: { recruiterId: employeeId },
      include: {
        candidate: { select: { firstName: true, lastName: true, client: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: incentives });
  } catch (error) {
    return handleApiError(error, "fetch own hiring incentives");
  }
}
