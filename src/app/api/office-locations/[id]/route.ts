import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { editOfficeLocationSchema } from "@/lib/validations/office-location";
import { logAudit } from "@/lib/audit";

// PUT /api/office-locations/[id] — admin/hr only, corrects a branch location's own details.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id } = await params;

    const existing = await db.officeLocation.findUnique({ where: { id } });
    if (!existing) return apiError("Office location not found", 404);

    const body = await request.json();
    const parsed = editOfficeLocationSchema.parse(body);

    const location = await db.officeLocation.update({ where: { id }, data: parsed });
    await logAudit({ session, action: "update", entity: "OfficeLocation", entityId: id });

    return NextResponse.json({ data: location });
  } catch (error) {
    return handleApiError(error, "update office location");
  }
}

// DELETE /api/office-locations/[id] — admin/hr only. Blocked while any employee is assigned
// to it, mirroring the same guard on Shift deletion — never silently orphans someone's
// geofence target back onto Company's own default location without an explicit reassignment.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id } = await params;

    const existing = await db.officeLocation.findUnique({ where: { id } });
    if (!existing) return apiError("Office location not found", 404);

    const assignedCount = await db.employee.count({ where: { officeLocationId: id } });
    if (assignedCount > 0) {
      return apiError(`Cannot delete — ${assignedCount} employee(s) are currently assigned to this location. Reassign them first.`, 400);
    }

    await db.officeLocation.delete({ where: { id } });
    await logAudit({ session, action: "delete", entity: "OfficeLocation", entityId: id, details: { name: existing.name } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "delete office location");
  }
}
