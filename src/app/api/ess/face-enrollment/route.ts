import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOwnEmployeeId } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { enrollFaceSchema } from "@/lib/validations/face-enrollment";
import { upsertFaceEnrollment } from "@/lib/face-enrollment";
import { logAudit } from "@/lib/audit";

// GET /api/ess/face-enrollment — your own enrollment status. Never returns the descriptor
// itself (write-only from the client's perspective) — only whether one exists and when.
export async function GET(request: NextRequest) {
  try {
    const { employeeId } = await requireOwnEmployeeId(request);
    const enrollment = await db.faceEnrollment.findUnique({ where: { employeeId } });
    return NextResponse.json({
      data: enrollment ? { enrolled: true, enrolledAt: enrollment.createdAt, consentedAt: enrollment.consentedAt, updatedAt: enrollment.updatedAt } : { enrolled: false },
    });
  } catch (error) {
    return handleApiError(error, "fetch face enrollment status");
  }
}

// POST /api/ess/face-enrollment — enroll (or re-enroll) your own reference face. The descriptor
// is a 128-number face-api.js embedding computed client-side from a live camera capture; the
// actual photo never reaches the server. Requires an explicit consent flag on every submission,
// including re-enrollment, since each one is a fresh consent act.
export async function POST(request: NextRequest) {
  try {
    const { session, employeeId } = await requireOwnEmployeeId(request);
    const body = await request.json();
    const { descriptor } = enrollFaceSchema.parse(body);

    const { enrollment, wasExisting } = await upsertFaceEnrollment(employeeId, descriptor);

    await logAudit({ session, action: wasExisting ? "update" : "create", entity: "FaceEnrollment", entityId: enrollment.id });

    return NextResponse.json({ data: { enrolled: true, enrolledAt: enrollment.createdAt, consentedAt: enrollment.consentedAt } }, { status: wasExisting ? 200 : 201 });
  } catch (error) {
    return handleApiError(error, "enroll face");
  }
}

// DELETE /api/ess/face-enrollment — withdraw your own enrollment (right to erasure). Face
// punch simply becomes unavailable until re-enrolled; every other punch method is unaffected.
export async function DELETE(request: NextRequest) {
  try {
    const { session, employeeId } = await requireOwnEmployeeId(request);
    const existing = await db.faceEnrollment.findUnique({ where: { employeeId } });
    if (!existing) {
      return apiError("No face enrollment on record.", 404);
    }
    await db.faceEnrollment.delete({ where: { employeeId } });
    await logAudit({ session, action: "delete", entity: "FaceEnrollment", entityId: existing.id });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "delete face enrollment");
  }
}
