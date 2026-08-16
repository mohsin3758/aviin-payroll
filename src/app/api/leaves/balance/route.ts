import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";
import { requirePayrollSelfOrFeature } from "@/lib/payroll-access";

// GET /api/leaves/balance?employeeId=...&year=...
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const employeeId = searchParams.get("employeeId");

    if (!employeeId) {
      return apiError("employeeId query parameter is required", 400);
    }

    // Same category of gap as the rest of this pass: found while writing the integration
    // tests below, not one of the original 7, but the identical missing-ownership-check bug.
    await requirePayrollSelfOrFeature(request, employeeId, ["admin", "hr", "manager"], "manage_leave_management");

    const yearParam = searchParams.get("year");
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

    const balances = await db.leaveBalance.findMany({
      where: {
        employeeId,
        year,
      },
      include: {
        leaveType: true,
      },
      orderBy: {
        leaveType: { name: "asc" },
      },
    });

    return NextResponse.json(balances);
  } catch (error) {
    return handleApiError(error, "fetch leave balance");
  }
}
