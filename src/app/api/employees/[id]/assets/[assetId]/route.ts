import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

// PUT /api/employees/[id]/assets/[assetId] — admin/hr only, marks an asset returned.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string; assetId: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id, assetId } = await params;

    const existing = await db.employeeAsset.findUnique({ where: { id: assetId } });
    if (!existing || existing.employeeId !== id) return apiError("Asset not found", 404);

    const asset = await db.employeeAsset.update({ where: { id: assetId }, data: { returnedDate: new Date() } });

    await logAudit({ session, action: "update", entity: "EmployeeAsset", entityId: assetId, details: { returned: true } });

    return NextResponse.json({ data: asset });
  } catch (error) {
    return handleApiError(error, "return asset");
  }
}
