import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole, requireSelfOrRole } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

const allocateAssetSchema = z.object({
  assetType: z.enum(["laptop", "phone", "id_card", "other"]),
  assetTag: z.string().trim().max(100).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

// GET /api/employees/[id]/assets — operational, not financial: self, or admin/hr/manager.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSelfOrRole(request, id, ["admin", "hr", "manager"]);
    const assets = await db.employeeAsset.findMany({ where: { employeeId: id }, orderBy: { allocatedDate: "desc" } });
    return NextResponse.json({ data: assets });
  } catch (error) {
    return handleApiError(error, "fetch employee assets");
  }
}

// POST /api/employees/[id]/assets — admin/hr only, allocates a new asset.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id } = await params;
    const body = await request.json();
    const parsed = allocateAssetSchema.parse(body);

    const employee = await db.employee.findUnique({ where: { id } });
    if (!employee) return apiError("Employee not found", 404);

    const asset = await db.employeeAsset.create({ data: { employeeId: id, ...parsed } });

    await logAudit({ session, action: "create", entity: "EmployeeAsset", entityId: asset.id });

    return NextResponse.json({ data: asset }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "allocate asset");
  }
}
