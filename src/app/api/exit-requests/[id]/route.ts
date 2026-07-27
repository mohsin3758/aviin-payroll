import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";

// GET /api/exit-requests/[id] — full detail with checklist + settlement.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(request);
    const { id } = await params;

    const exitRequest = await db.exitRequest.findUnique({
      where: { id },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeCode: true, designation: true, department: true, email: true } },
        checklistItems: { orderBy: { order: "asc" } },
        finalSettlement: true,
      },
    });
    if (!exitRequest) return apiError("Exit request not found", 404);
    if (session.role === "employee" && session.employeeId !== exitRequest.employeeId) {
      return apiError("You can only view your own exit request.", 403);
    }

    return NextResponse.json({ data: exitRequest });
  } catch (error) {
    return handleApiError(error, "fetch exit request");
  }
}
