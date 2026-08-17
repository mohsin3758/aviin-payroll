import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePayrollFeature, assertEmployeeInScope } from "@/lib/payroll-access";
import { apiError, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

const editAssetSchema = z.object({
  assetType: z.enum(["laptop", "phone", "id_card", "other"]).optional(),
  // Present and non-null = assign to this employee (resets allocatedDate to now, clears
  // returnedDate). Present and null = return to the unassigned company pool ("In Stock"),
  // clearing both employeeId and returnedDate. Omitted = leave assignment untouched.
  employeeId: z.string().min(1).nullable().optional(),
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

// PATCH /api/assets/[id] — admin/hr only. Edits detail fields and/or (re)assigns the asset via
// `employeeId`. This is the company-wide counterpart to
// /api/employees/[id]/assets/[assetId] (PATCH there only ever edits one already-assigned
// employee's asset; this route also handles assignment and return-to-stock for the general pool).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session, restriction } = await requirePayrollFeature(request, ["admin", "hr"], "manage_employee_assets");

    const existing = await db.employeeAsset.findUnique({ where: { id } });
    if (!existing) return apiError("Asset not found", 404);
    // A scoped hr user may only touch an asset currently tied to one of their allowed employees
    // (or already unassigned — nothing to leak there).
    if (existing.employeeId) assertEmployeeInScope(restriction, existing.employeeId);

    const body = await request.json();
    const { employeeId, ...fields } = editAssetSchema.parse(body);

    const data: Record<string, unknown> = { ...fields };
    if ("employeeId" in body) {
      if (employeeId) {
        assertEmployeeInScope(restriction, employeeId);
        const employee = await db.employee.findUnique({ where: { id: employeeId } });
        if (!employee) return apiError("Employee not found", 404);
        data.employeeId = employeeId;
        data.allocatedDate = new Date();
        data.returnedDate = null;
      } else {
        data.employeeId = null;
        data.returnedDate = null;
      }
    }

    const asset = await db.employeeAsset.update({
      where: { id },
      data,
      include: { employee: { select: { firstName: true, lastName: true, employeeCode: true, dateOfExit: true } } },
    });

    await logAudit({
      session,
      action: "update",
      entity: "EmployeeAsset",
      entityId: id,
      details: "employeeId" in body ? { reassignedTo: employeeId ?? "in_stock" } : { edited: true },
    });

    return NextResponse.json({ data: asset });
  } catch (error) {
    return handleApiError(error, "update asset");
  }
}

// DELETE /api/assets/[id] — admin/hr only. Removes a mistakenly-created record entirely
// (assigned or unassigned). Use PATCH to return-to-stock instead if the asset is real.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session, restriction } = await requirePayrollFeature(request, ["admin", "hr"], "manage_employee_assets");

    const existing = await db.employeeAsset.findUnique({ where: { id } });
    if (!existing) return apiError("Asset not found", 404);
    if (existing.employeeId) assertEmployeeInScope(restriction, existing.employeeId);

    await db.employeeAsset.delete({ where: { id } });

    await logAudit({ session, action: "delete", entity: "EmployeeAsset", entityId: id, details: { assetType: existing.assetType, assetTag: existing.assetTag } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "delete asset");
  }
}
