import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// PUT /api/arrears/[id] — cancel a pending arrear before it's been paid
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id } = await params;
    const body = await request.json();

    const existing = await db.salaryArrear.findUnique({ where: { id } });
    if (!existing) {
      return apiError("Arrear not found", 404);
    }
    if (existing.status === "paid") {
      return apiError("This arrear has already been paid out and cannot be cancelled.", 409);
    }
    if (body.status !== "cancelled") {
      return apiError("Only cancelling a pending arrear is supported here.", 400);
    }

    const arrear = await db.salaryArrear.update({
      where: { id },
      data: { status: "cancelled" },
    });

    await logAudit({ session, action: "update", entity: "SalaryArrear", entityId: id, details: { toStatus: "cancelled" } });

    return NextResponse.json(arrear);
  } catch (error) {
    return handleApiError(error, "update arrear");
  }
}
