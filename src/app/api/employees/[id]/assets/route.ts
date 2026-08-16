import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePayrollFeature, requirePayrollSelfOrFeature, assertEmployeeInScope } from "@/lib/payroll-access";
import { apiError, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

const allocateAssetSchema = z.object({
  assetType: z.enum(["laptop", "phone", "id_card", "other"]),
  assetTag: z.string().trim().max(100).nullable().optional(),
  brand: z.string().trim().max(100).nullable().optional(),
  model: z.string().trim().max(100).nullable().optional(),
  condition: z.enum(["new", "good", "fair", "damaged"]).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

// GET /api/employees/[id]/assets — operational, not financial: self, or admin/hr/manager.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requirePayrollSelfOrFeature(request, id, ["admin", "hr", "manager"], "manage_employee_assets");
    const assets = await db.employeeAsset.findMany({ where: { employeeId: id }, orderBy: { allocatedDate: "desc" } });
    return NextResponse.json({ data: assets });
  } catch (error) {
    return handleApiError(error, "fetch employee assets");
  }
}

// POST /api/employees/[id]/assets — admin/hr only, allocates a new asset.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session, restriction } = await requirePayrollFeature(request, ["admin", "hr"], "manage_employee_assets");
    assertEmployeeInScope(restriction, id);
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
