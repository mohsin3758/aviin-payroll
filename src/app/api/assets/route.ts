import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePayrollFeature, assertEmployeeInScope } from "@/lib/payroll-access";
import { apiError, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

// GET /api/assets — company-wide asset inventory, admin/hr only. Everything else in this
// feature is scoped to one employee at a time (Onboarding); this is the only cross-employee
// view, so it stays out of ESS entirely and off the manager/self-or-role tier.
export async function GET(request: NextRequest) {
  try {
    const { restriction } = await requirePayrollFeature(request, ["admin", "hr"], "view_assets");
    const { searchParams } = request.nextUrl;
    const search = searchParams.get("search") ?? "";
    const assetType = searchParams.get("assetType");
    const status = searchParams.get("status"); // "in_stock" | "with_employee" | "returned"

    const where: Record<string, unknown> = {};

    if (assetType) {
      where.assetType = assetType;
    }
    if (status === "in_stock") {
      where.employeeId = null;
    } else if (status === "with_employee") {
      where.employeeId = { not: null };
      where.returnedDate = null;
    } else if (status === "returned") {
      where.returnedDate = { not: null };
    }
    // An employee-scoped hr user never sees the unassigned company-wide pool — that isn't any
    // particular employee's data, so it's out of scope for a user narrowed to specific people.
    if (restriction.employeeIds) {
      where.employeeId = { in: [...restriction.employeeIds] };
    }
    if (search) {
      where.OR = [
        { assetTag: { contains: search } },
        { brand: { contains: search } },
        { model: { contains: search } },
        { employee: { firstName: { contains: search } } },
        { employee: { lastName: { contains: search } } },
        { employee: { employeeCode: { contains: search } } },
      ];
    }

    const assets = await db.employeeAsset.findMany({
      where,
      include: { employee: { select: { firstName: true, lastName: true, employeeCode: true, dateOfExit: true } } },
      orderBy: { allocatedDate: "desc" },
    });

    return NextResponse.json({ data: assets });
  } catch (error) {
    return handleApiError(error, "fetch assets");
  }
}

const createAssetSchema = z.object({
  assetType: z.enum(["laptop", "phone", "id_card", "other"]),
  // Company inventory not yet handed to anyone — leave unset (or null) to add it "In Stock".
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

// POST /api/assets — admin/hr only. Adds a new asset to company inventory, optionally already
// assigned to an employee (employeeId set) or left unassigned/"In Stock" (employeeId omitted).
export async function POST(request: NextRequest) {
  try {
    const { session, restriction } = await requirePayrollFeature(request, ["admin", "hr"], "manage_employee_assets");
    const body = await request.json();
    const parsed = createAssetSchema.parse(body);

    if (parsed.employeeId) {
      assertEmployeeInScope(restriction, parsed.employeeId);
      const employee = await db.employee.findUnique({ where: { id: parsed.employeeId } });
      if (!employee) return apiError("Employee not found", 404);
    }

    const asset = await db.employeeAsset.create({
      data: parsed,
      include: { employee: { select: { firstName: true, lastName: true, employeeCode: true, dateOfExit: true } } },
    });

    await logAudit({ session, action: "create", entity: "EmployeeAsset", entityId: asset.id, details: { employeeId: parsed.employeeId ?? null, inStock: !parsed.employeeId } });

    return NextResponse.json({ data: asset }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "create asset");
  }
}
