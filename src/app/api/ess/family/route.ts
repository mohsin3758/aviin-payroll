import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOwnEmployeeId } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { familyMemberSchema } from "@/lib/validations/ess";

export async function GET(request: NextRequest) {
  try {
    const { employeeId } = await requireOwnEmployeeId(request);
    const familyMembers = await db.employeeFamilyMember.findMany({
      where: { employeeId },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ data: familyMembers });
  } catch (error) {
    return handleApiError(error, "fetch family members");
  }
}

export async function POST(request: NextRequest) {
  try {
    const { employeeId } = await requireOwnEmployeeId(request);
    const body = await request.json();
    const parsed = familyMemberSchema.parse(body);

    const member = await db.employeeFamilyMember.create({ data: { employeeId, ...parsed } });
    return NextResponse.json({ data: member }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "add family member");
  }
}
