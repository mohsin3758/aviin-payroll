import { NextRequest, NextResponse } from "next/server";
import { getForm16Data, Form16Error } from "@/lib/payroll/form16";

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
    console.error("[FORM16_GET]", error);
    return NextResponse.json({ error: "Failed to generate Form 16" }, { status: 500 });
  }
}
