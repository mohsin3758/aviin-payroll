import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOwnEmployeeId } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { educationSchema } from "@/lib/validations/ess";

export async function GET(request: NextRequest) {
  try {
    const { employeeId } = await requireOwnEmployeeId(request);
    const education = await db.employeeEducation.findMany({
      where: { employeeId },
      orderBy: { yearOfPassing: "desc" },
    });
    return NextResponse.json({ data: education });
  } catch (error) {
    return handleApiError(error, "fetch education");
  }
}

export async function POST(request: NextRequest) {
  try {
    const { employeeId } = await requireOwnEmployeeId(request);
    const body = await request.json();
    const parsed = educationSchema.parse(body);

    const record = await db.employeeEducation.create({ data: { employeeId, ...parsed } });
    return NextResponse.json({ data: record }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "add education");
  }
}
