import { NextRequest, NextResponse } from "next/server";
import { getSalarySlipData, SalarySlipError } from "@/lib/payroll/salary-slip";

// GET /api/salary-slip?employeeId=xxx&month=1&year=2025
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId");
    const monthParam = searchParams.get("month");
    const yearParam = searchParams.get("year");

    if (!employeeId || !monthParam || !yearParam) {
      return NextResponse.json(
        { error: "employeeId, month, and year are required query parameters" },
        { status: 400 }
      );
    }

    const month = parseInt(monthParam, 10);
    const year = parseInt(yearParam, 10);

    if (isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json(
        { error: "month must be between 1 and 12" },
        { status: 400 }
      );
    }
    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: "year must be a valid year" },
        { status: 400 }
      );
    }

    const slipData = await getSalarySlipData(employeeId, month, year);

    return NextResponse.json({ data: slipData });
  } catch (error) {
    if (error instanceof SalarySlipError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[SALARY_SLIP_GET]", error);
    return NextResponse.json(
      { error: "Failed to generate salary slip" },
      { status: 500 }
    );
  }
}
