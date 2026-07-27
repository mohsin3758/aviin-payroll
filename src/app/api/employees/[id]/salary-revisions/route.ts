import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";

// GET /api/employees/[id]/salary-revisions — the append-only salary change history.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(request);
    const { id } = await params;
    const revisions = await db.salaryRevision.findMany({
      where: { employeeId: id },
      orderBy: { effectiveDate: "desc" },
    });
    return NextResponse.json({ data: revisions });
  } catch (error) {
    return handleApiError(error, "fetch salary revisions");
  }
}
