import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

const updateSchema = z.object({ isCompleted: z.boolean() });

// PUT /api/exit-requests/[id]/checklist/[itemId] — admin/hr only.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id, itemId } = await params;
    const body = await request.json();
    const { isCompleted } = updateSchema.parse(body);

    const existing = await db.exitChecklistItem.findUnique({ where: { id: itemId } });
    if (!existing || existing.exitRequestId !== id) return apiError("Checklist item not found", 404);

    // "Company assets returned" is a free-text checklist title (see DEFAULT_EXIT_CHECKLIST in
    // hr-approve/route.ts) — this is the one place it's cross-checked against real
    // EmployeeAsset records, so HR can't tick it off while a laptop/phone is still outstanding.
    if (isCompleted && existing.taskName === "Company assets returned") {
      const exitRequest = await db.exitRequest.findUnique({ where: { id } });
      if (exitRequest) {
        const unreturned = await db.employeeAsset.findMany({
          where: { employeeId: exitRequest.employeeId, returnedDate: null },
        });
        if (unreturned.length > 0) {
          const list = unreturned.map((a) => `${a.assetType}${a.assetTag ? ` (${a.assetTag})` : ""}`).join(", ");
          return apiError(`Cannot check this off — ${unreturned.length} asset(s) still not marked returned: ${list}. Mark them returned first.`, 400);
        }
      }
    }

    const item = await db.exitChecklistItem.update({
      where: { id: itemId },
      data: { isCompleted, completedBy: isCompleted ? session.userId : null, completedAt: isCompleted ? new Date() : null },
    });

    await logAudit({ session, action: "update", entity: "ExitChecklistItem", entityId: itemId, details: { isCompleted } });

    return NextResponse.json({ data: item });
  } catch (error) {
    return handleApiError(error, "update exit checklist item");
  }
}
