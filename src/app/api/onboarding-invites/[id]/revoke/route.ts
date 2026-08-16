import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePayrollFeature, assertEmployeeInScope } from "@/lib/payroll-access";
import { apiError, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { canResendOrRevoke } from "@/lib/onboarding-invite";

// POST /api/onboarding-invites/[id]/revoke — admin/hr only. Kills the current link immediately
// (the token stays hashed in place but the status check in resolveInviteByToken rejects any
// non-"approved" terminal status). Blocked only once approved — an active employee's
// onboarding is done, there's nothing left to revoke.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session, restriction } = await requirePayrollFeature(request, ["admin", "hr"], "manage_onboarding");
    const { id } = await params;

    const invite = await db.onboardingInvite.findUnique({ where: { id } });
    if (!invite) return apiError("Onboarding invite not found", 404);
    assertEmployeeInScope(restriction, invite.employeeId);
    if (!canResendOrRevoke(invite.status)) {
      return apiError("Cannot revoke — this onboarding has already been approved.", 409);
    }

    const updated = await db.onboardingInvite.update({ where: { id }, data: { status: "revoked" } });

    await logAudit({ session, action: "update", entity: "OnboardingInvite", entityId: id, details: { revoked: true } });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return handleApiError(error, "revoke onboarding invite");
  }
}
