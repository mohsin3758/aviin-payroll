import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePayrollFeature, assertEmployeeInScope } from "@/lib/payroll-access";
import { apiError, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

const editAssetSchema = z.object({
  assetType: z.enum(["laptop", "phone", "id_card", "other"]).optional(),
  assetTag: z.string().trim().max(100).nullable().optional(),
  brand: z.string().trim().max(100).nullable().optional(),
  model: z.string().trim().max(100).nullable().optional(),
  condition: z.enum(["new", "good", "fair", "damaged"]).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  chargerSerialNo: z.string().trim().max(100).nullable().optional(),
  chargerWireSerialNo: z.string().trim().max(100).nullable().optional(),
  laptopName: z.string().trim().max(100).nullable().optional(),
  laptopLoginId: z.string().trim().max(100).nullable().optional(),
  laptopPassword: z.string().trim().max(100).nullable().optional(),
  laptopPin: z.string().trim().max(20).nullable().optional(),
});

// PUT /api/employees/[id]/assets/[assetId] — admin/hr only, marks an asset returned.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string; assetId: string }> }) {
  try {
    const { id, assetId } = await params;
    const { session, restriction } = await requirePayrollFeature(request, ["admin", "hr"], "manage_employee_assets");
    assertEmployeeInScope(restriction, id);

    const existing = await db.employeeAsset.findUnique({ where: { id: assetId } });
    if (!existing || existing.employeeId !== id) return apiError("Asset not found", 404);

    const asset = await db.employeeAsset.update({ where: { id: assetId }, data: { returnedDate: new Date() } });

    await logAudit({ session, action: "update", entity: "EmployeeAsset", entityId: assetId, details: { returned: true } });

    return NextResponse.json({ data: asset });
  } catch (error) {
    return handleApiError(error, "return asset");
  }
}

// PATCH /api/employees/[id]/assets/[assetId] — admin/hr only, corrects an asset's own details
// (type/brand/model/tag/condition/notes) — distinct from PUT, which only ever marks it returned.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; assetId: string }> }) {
  try {
    const { id, assetId } = await params;
    const { session, restriction } = await requirePayrollFeature(request, ["admin", "hr"], "manage_employee_assets");
    assertEmployeeInScope(restriction, id);

    const existing = await db.employeeAsset.findUnique({ where: { id: assetId } });
    if (!existing || existing.employeeId !== id) return apiError("Asset not found", 404);

    const body = await request.json();
    const parsed = editAssetSchema.parse(body);

    const asset = await db.employeeAsset.update({ where: { id: assetId }, data: parsed });

    await logAudit({ session, action: "update", entity: "EmployeeAsset", entityId: assetId, details: { edited: true } });

    return NextResponse.json({ data: asset });
  } catch (error) {
    return handleApiError(error, "update asset");
  }
}

// DELETE /api/employees/[id]/assets/[assetId] — admin/hr only, removes a mistakenly-created
// asset record entirely. Returning an asset should use PUT instead; this is for correcting
// data-entry mistakes, not the normal end-of-life path for a real allocated asset.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; assetId: string }> }) {
  try {
    const { id, assetId } = await params;
    const { session, restriction } = await requirePayrollFeature(request, ["admin", "hr"], "manage_employee_assets");
    assertEmployeeInScope(restriction, id);

    const existing = await db.employeeAsset.findUnique({ where: { id: assetId } });
    if (!existing || existing.employeeId !== id) return apiError("Asset not found", 404);

    await db.employeeAsset.delete({ where: { id: assetId } });

    await logAudit({ session, action: "delete", entity: "EmployeeAsset", entityId: assetId, details: { assetType: existing.assetType, assetTag: existing.assetTag } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "delete asset");
  }
}
