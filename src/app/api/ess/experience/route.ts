import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOwnEmployeeId } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { experienceSchema } from "@/lib/validations/ess";

export async function GET(request: NextRequest) {
  try {
    const { employeeId } = await requireOwnEmployeeId(request);
    const experiences = await db.employeeExperience.findMany({
      where: { employeeId },
      orderBy: { fromDate: "desc" },
    });
    return NextResponse.json({ data: experiences });
  } catch (error) {
    return handleApiError(error, "fetch experience");
  }
}

export async function POST(request: NextRequest) {
  try {
    const { employeeId } = await requireOwnEmployeeId(request);
    const body = await request.json();
    const parsed = experienceSchema.parse(body);

    const record = await db.employeeExperience.create({ data: { employeeId, ...parsed } });
    return NextResponse.json({ data: record }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "add experience");
  }
}
