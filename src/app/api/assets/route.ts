import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";

// GET /api/assets — company-wide asset inventory, admin/hr only. Everything else in this
// feature is scoped to one employee at a time (Onboarding); this is the only cross-employee
// view, so it stays out of ESS entirely and off the manager/self-or-role tier.
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ["admin", "hr"]);
    const { searchParams } = request.nextUrl;
    const search = searchParams.get("search") ?? "";
    const assetType = searchParams.get("assetType");
    const status = searchParams.get("status"); // "with_employee" | "returned"

    const where: Record<string, unknown> = {};

    if (assetType) {
      where.assetType = assetType;
    }
    if (status === "with_employee") {
      where.returnedDate = null;
    } else if (status === "returned") {
      where.returnedDate = { not: null };
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
