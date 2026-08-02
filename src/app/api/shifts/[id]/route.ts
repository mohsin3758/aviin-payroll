import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

const editShiftSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM 24-hour format").optional(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM 24-hour format").optional(),
  gracePeriodMinutes: z.coerce.number().int().min(0).max(120).optional(),
});

// PUT /api/shifts/[id] — admin/hr only, corrects a shift definition's own details.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id } = await params;

    const existing = await db.shift.findUnique({ where: { id } });
    if (!existing) return apiError("Shift not found", 404);

    const body = await request.json();
    const parsed = editShiftSchema.parse(body);

    const shift = await db.shift.update({ where: { id }, data: parsed });
    await logAudit({ session, action: "update", entity: "Shift", entityId: id });

    return NextResponse.json({ data: shift });
  } catch (error) {
    return handleApiError(error, "update shift");
  }
}

// DELETE /api/shifts/[id] — admin/hr only. Blocked while any employee is currently assigned to
// it, so removing a shift definition can never silently orphan someone's schedule.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id } = await params;

    const existing = await db.shift.findUnique({ where: { id } });
    if (!existing) return apiError("Shift not found", 404);

    const assignedCount = await db.employeeShift.count({ where: { shiftId: id } });
    if (assignedCount > 0) {
      return apiError(`Cannot delete — ${assignedCount} employee(s) are currently assigned to this shift. Reassign them first.`, 400);
    }

    await db.shift.delete({ where: { id } });
    await logAudit({ session, action: "delete", entity: "Shift", entityId: id, details: { name: existing.name } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "delete shift");
  }
}
