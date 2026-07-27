import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOwnEmployeeId } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";

// GET /api/ess/attendance?month=&year() — the current user's own attendance calendar for a month.
export async function GET(request: NextRequest) {
  try {
    const { employeeId } = await requireOwnEmployeeId(request);
    const { searchParams } = request.nextUrl;
    const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1), 10);
    const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()), 10);

    if (isNaN(month) || month < 1 || month > 12 || isNaN(year)) {
      return apiError("Valid month (1-12) and year are required", 400);
    }

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    const records = await db.attendance.findMany({
      where: { employeeId, date: { gte: startDate, lte: endDate } },
      orderBy: { date: "asc" },
    });

    return NextResponse.json({ data: records });
  } catch (error) {
    return handleApiError(error, "fetch own attendance");
  }
}
