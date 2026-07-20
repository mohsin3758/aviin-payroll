import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/leaves/balance?employeeId=...&year=...
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const employeeId = searchParams.get("employeeId");

  if (!employeeId) {
    return NextResponse.json(
      { error: "employeeId query parameter is required" },
      { status: 400 }
    );
  }

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
}