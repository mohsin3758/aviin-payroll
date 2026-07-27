import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOwnEmployeeId } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { employeeId } = await requireOwnEmployeeId(request);
    const { id } = await params;

    const existing = await db.employeeEducation.findUnique({ where: { id } });
    if (!existing || existing.employeeId !== employeeId) {
      return apiError("Education record not found", 404);
    }

    await db.employeeEducation.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "delete education record");
  }
}
