import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { createOfficeLocationSchema } from "@/lib/validations/office-location";
import { logAudit } from "@/lib/audit";

// GET /api/office-locations — every authenticated role (the Employees screen needs this list
// to populate the Work Location assignment, same visibility tier as GET /api/shifts).
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const locations = await db.officeLocation.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json({ data: locations });
  } catch (error) {
    return handleApiError(error, "fetch office locations");
  }
}

// POST /api/office-locations — admin/hr only.
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const body = await request.json();
    const parsed = createOfficeLocationSchema.parse(body);

    const location = await db.officeLocation.create({ data: parsed });
    await logAudit({ session, action: "create", entity: "OfficeLocation", entityId: location.id });

    return NextResponse.json({ data: location }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "create office location");
  }
}
