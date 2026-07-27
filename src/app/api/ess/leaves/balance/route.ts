import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOwnEmployeeId } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";

// GET /api/ess/leaves/balance?year= — the current user's own leave balances.
export async function GET(request: NextRequest) {
  try {
    const { employeeId } = await requireOwnEmployeeId(request);
    const { searchParams } = request.nextUrl;
    const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()), 10);

    const balances = await db.leaveBalance.findMany({
      where: { employeeId, year },
      include: { leaveType: true },
      orderBy: { leaveType: { name: "asc" } },
    });

    return NextResponse.json({ data: balances });
  } catch (error) {
    return handleApiError(error, "fetch own leave balance");
  }
}
