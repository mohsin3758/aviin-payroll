import { NextRequest, NextResponse } from "next/server";
import { requireOwnEmployeeId } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { getSalarySlipData, SalarySlipError } from "@/lib/payroll/salary-slip";

// GET /api/ess/payslip?month=&year= — the current user's own salary slip.
export async function GET(request: NextRequest) {
  try {
    const { employeeId } = await requireOwnEmployeeId(request);
    const { searchParams } = request.nextUrl;
    const month = parseInt(searchParams.get("month") ?? "", 10);
    const year = parseInt(searchParams.get("year") ?? "", 10);

    if (isNaN(month) || month < 1 || month > 12 || isNaN(year)) {
      return apiError("Valid month (1-12) and year are required", 400);
    }

    const slipData = await getSalarySlipData(employeeId, month, year);
    return NextResponse.json({ data: slipData });
  } catch (error) {
    if (error instanceof SalarySlipError) {
      return apiError(error.message, error.status);
    }
    return handleApiError(error, "fetch own salary slip");
  }
}
