import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyPendingFaceToken } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { completeLogin } from "@/lib/complete-login";
import { upsertFaceEnrollment } from "@/lib/face-enrollment";
import { enrollFaceSchema } from "@/lib/validations/face-enrollment";
import { logAudit } from "@/lib/audit";

// POST /api/auth/face-login/enroll — the mandatory "first face-login" path: this account is
// eligible for required face verification but hasn't enrolled yet (see /api/auth/login), so
// enrollment and completing this login happen as one continuous action. Reuses the exact same
// enrollFaceSchema + upsertFaceEnrollment as the ESS self-enrollment route (src/app/api/ess/
// face-enrollment/route.ts) so the two paths can never store enrollments differently.
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "local";
    const rl = checkRateLimit(`face-login:${ip}`, 10, 60_000);
    if (!rl.allowed) {
      return apiError("Too many attempts. Try again in a minute.", 429);
    }

    const body = await request.json();
    const { pendingToken, latitude, longitude, accuracy } = body;
    if (typeof pendingToken !== "string" || !pendingToken) {
      return apiError("Your session has expired. Please sign in again.", 401);
    }
    const { descriptor } = enrollFaceSchema.parse(body);

    const pending = await verifyPendingFaceToken(pendingToken);
    if (!pending) {
      return apiError("Your session has expired. Please sign in again.", 401);
    }

    const user = await db.user.findUnique({ where: { id: pending.userId } });
    if (!user || !user.active || !user.employeeId) {
      return apiError("Your session has expired. Please sign in again.", 401);
    }

    const { enrollment } = await upsertFaceEnrollment(user.employeeId, descriptor);
    await logAudit({
      session: { userId: user.id, email: user.email, name: user.name, role: user.role as "admin" | "hr" | "manager" | "employee", employeeId: user.employeeId },
      action: "create",
      entity: "FaceEnrollment",
      entityId: enrollment.id,
      ipAddress: ip,
    });

    return completeLogin(user, {
      ipAddress: ip,
      auditAction: "face-login-success",
      latitude: typeof latitude === "number" && Number.isFinite(latitude) ? latitude : null,
      longitude: typeof longitude === "number" && Number.isFinite(longitude) ? longitude : null,
      accuracy: typeof accuracy === "number" && Number.isFinite(accuracy) ? accuracy : null,
    });
  } catch (error) {
    return handleApiError(error, "enroll face at login");
  }
}
