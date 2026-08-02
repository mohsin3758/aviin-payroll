import { NextResponse, NextRequest } from "next/server";
import { db } from "@/lib/db";
import { editHolidaySchema } from "@/lib/validations/holiday";
import { apiError, getDefaultCompanyId, handleApiError } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// PUT /api/holidays/[id] — admin/hr only, corrects a holiday's own details.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id } = await params;

    const existing = await db.holiday.findUnique({ where: { id } });
    if (!existing) {
      return apiError("Holiday not found", 404);
    }

    const body = await request.json();
    const parsed = editHolidaySchema.parse(body);

    if (parsed.date) {
      const companyId = await getDefaultCompanyId();
      const collision = await db.holiday.findUnique({ where: { companyId_date: { companyId, date: parsed.date } } });
      if (collision && collision.id !== id) {
        return apiError(`A holiday ("${collision.name}") is already set for this date.`, 409);
      }
    }

    const holiday = await db.holiday.update({ where: { id }, data: parsed });

    await logAudit({ session, action: "update", entity: "Holiday", entityId: id });

    return NextResponse.json({ data: holiday });
  } catch (error) {
    return handleApiError(error, "update holiday");
  }
}

// DELETE /api/holidays/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id } = await params;

    const existing = await db.holiday.findUnique({ where: { id } });
    if (!existing) {
      return apiError("Holiday not found", 404);
    }

    await db.holiday.delete({ where: { id } });

    await logAudit({
      session,
      action: "delete",
      entity: "Holiday",
      entityId: id,
      details: { name: existing.name, date: existing.date.toISOString() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "delete holiday");
  }
}
