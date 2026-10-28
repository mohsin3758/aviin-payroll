import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// DELETE /api/clients/[id]/holidays/[holidayId] — admin/hr only. Holidays only feed the
// "working days" figure (a pre-fill input), so removing one has no effect on past payroll runs.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; holidayId: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id, holidayId } = await params;
    const existing = await db.clientHoliday.findUnique({ where: { id: holidayId } });
    if (!existing || existing.clientId !== id) return apiError("Holiday not found", 404);

    await db.clientHoliday.delete({ where: { id: holidayId } });
    await logAudit({ session, action: "delete", entity: "ClientHoliday", entityId: holidayId, details: { clientId: id, name: existing.name, date: existing.date.toISOString() } });
    return NextResponse.json({ data: { id: holidayId } });
  } catch (error) {
    return handleApiError(error, "delete client holiday");
  }
}
