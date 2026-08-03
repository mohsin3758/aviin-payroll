import { db } from "@/lib/db";

// Shared by the ESS self-enrollment route and the mandatory enroll-at-login route, so both
// paths that create/replace a FaceEnrollment can never drift on how it's stored. Re-enrolling
// (from either path) always overwrites — one descriptor per employee, no history kept.
export async function upsertFaceEnrollment(employeeId: string, descriptor: number[]) {
  const existing = await db.faceEnrollment.findUnique({ where: { employeeId } });
  const enrollment = await db.faceEnrollment.upsert({
    where: { employeeId },
    create: { employeeId, descriptor: JSON.stringify(descriptor), consentedAt: new Date() },
    update: { descriptor: JSON.stringify(descriptor), consentedAt: new Date() },
  });
  return { enrollment, wasExisting: !!existing };
}
