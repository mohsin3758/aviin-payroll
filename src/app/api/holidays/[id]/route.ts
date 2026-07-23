import { NextResponse, NextRequest } from "next/server";
import { db } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

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
