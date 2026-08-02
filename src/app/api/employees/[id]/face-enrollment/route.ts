import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, requireSelfOrRole } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

// GET /api/employees/[id]/face-enrollment — enrollment status only, never the descriptor.
// Operational, not financial: self, or admin/hr/manager (same tier as shift/attendance).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSelfOrRole(request, id, ["admin", "hr", "manager"]);
    const enrollment = await db.faceEnrollment.findUnique({ where: { employeeId: id } });
    return NextResponse.json({
      data: enrollment ? { enrolled: true, enrolledAt: enrollment.createdAt, consentedAt: enrollment.consentedAt, updatedAt: enrollment.updatedAt } : { enrolled: false },
    });
  } catch (error) {
    return handleApiError(error, "fetch face enrollment status");
  }
}

// DELETE /api/employees/[id]/face-enrollment — admin/hr only. Revokes someone's enrollment
// (e.g. they've left, or asked HR to clear it in person) without needing their own login.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id } = await params;
    const existing = await db.faceEnrollment.findUnique({ where: { employeeId: id } });
    if (!existing) {
      return apiError("No face enrollment on record for this employee.", 404);
    }
    await db.faceEnrollment.delete({ where: { employeeId: id } });
    await logAudit({ session, action: "delete", entity: "FaceEnrollment", entityId: existing.id, details: { revokedByAdmin: true } });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "revoke face enrollment");
  }
}
