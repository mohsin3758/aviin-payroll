import { NextRequest, NextResponse } from "next/server";
import { requireOwnEmployeeId } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { getForm16Data, Form16Error } from "@/lib/payroll/form16";

// GET /api/ess/form16?fyStartYear= — the current user's own Form 16 (Part B).
export async function GET(request: NextRequest) {
  try {
    const { employeeId } = await requireOwnEmployeeId(request);
    const { searchParams } = request.nextUrl;
    const fyStartYear = parseInt(searchParams.get("fyStartYear") ?? "", 10);

    if (isNaN(fyStartYear) || fyStartYear < 2000 || fyStartYear > 2100) {
      return apiError("fyStartYear must be a valid year", 400);
    }

    const data = await getForm16Data(employeeId, fyStartYear);
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof Form16Error) {
      return apiError(error.message, error.status);
    }
    return handleApiError(error, "fetch own Form 16");
  }
}
