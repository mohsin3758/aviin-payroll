import { NextRequest, NextResponse } from "next/server";
import { getForm16Data, Form16Error } from "@/lib/payroll/form16";
import { requireSelfOrRole } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";

// GET /api/form16?employeeId=xxx&fyStartYear=2025
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId");
    const fyStartYearParam = searchParams.get("fyStartYear");

    if (!employeeId || !fyStartYearParam) {
      return NextResponse.json(
        { error: "employeeId and fyStartYear are required query parameters" },
        { status: 400 }
      );
    }

    // Carries one named person's PAN + full annual pay/tax detail — self or admin/hr only.
    await requireSelfOrRole(request, employeeId, ["admin", "hr"]);

    const fyStartYear = parseInt(fyStartYearParam, 10);
    if (isNaN(fyStartYear) || fyStartYear < 2000 || fyStartYear > 2100) {
      return NextResponse.json({ error: "fyStartYear must be a valid year" }, { status: 400 });
    }

    const data = await getForm16Data(employeeId, fyStartYear);
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof Form16Error) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return handleApiError(error, "generate Form 16");
  }
}
