import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPendingFaceToken } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { completeLogin } from "@/lib/complete-login";
import { isValidDescriptor, matchFaceDescriptors, FACE_LOGIN_MATCH_THRESHOLD } from "@/lib/face-match";
import { logAudit } from "@/lib/audit";

const faceLoginSchema = z.object({
  pendingToken: z.string().min(1),
  descriptor: z.array(z.number().finite()).length(128),
});

// POST /api/auth/face-login — completes a login that's already password-verified and was
// forked here by /api/auth/login because the company requires face verification and this
// account is already enrolled. Public route (under the existing /api/auth/ middleware
// allow-list) — auth for this endpoint comes entirely from the short-lived pendingToken, not a
// session cookie, since no session exists yet.
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "local";
    const rl = checkRateLimit(`face-login:${ip}`, 10, 60_000);
    if (!rl.allowed) {
      return apiError("Too many attempts. Try again in a minute.", 429);
    }

    const body = await request.json();
    const { pendingToken, descriptor } = faceLoginSchema.parse(body);

    const pending = await verifyPendingFaceToken(pendingToken);
    if (!pending) {
      return apiError("Your session has expired. Please sign in again.", 401);
    }
    if (!isValidDescriptor(descriptor)) {
      return apiError("A live face capture is required.", 400);
    }

    const user = await db.user.findUnique({ where: { id: pending.userId } });
    if (!user || !user.active || !user.employeeId) {
      return apiError("Your session has expired. Please sign in again.", 401);
    }

    const enrollment = await db.faceEnrollment.findUnique({ where: { employeeId: user.employeeId } });
    if (!enrollment) {
      return apiError("No face enrollment on record. Please sign in again.", 401);
    }

    let storedDescriptor: unknown;
    try {
      storedDescriptor = JSON.parse(enrollment.descriptor);
    } catch {
      storedDescriptor = null;
    }
    if (!isValidDescriptor(storedDescriptor)) {
      return apiError("Your face enrollment is corrupted — please re-enroll from My Portal.", 400);
    }

    const match = matchFaceDescriptors(descriptor, storedDescriptor, FACE_LOGIN_MATCH_THRESHOLD);
    if (!match.matched) {
      await logAudit({
        session: { userId: user.id, email: user.email, name: user.name, role: user.role as "admin" | "hr" | "manager" | "employee", employeeId: user.employeeId },
        action: "face-login-failed",
        entity: "User",
        entityId: user.id,
        details: { distance: match.distance, confidence: match.confidence },
        ipAddress: ip,
      });
      return apiError("Face not recognized. Try again with better lighting.", 401);
    }

    return completeLogin(user, { ipAddress: ip, auditAction: "face-login-success" });
  } catch (error) {
    return handleApiError(error, "verify face login");
  }
}
