import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/mailer";
import { canResendOrRevoke, rotateInviteToken } from "@/lib/onboarding-invite";
import { buildOnboardingInviteEmailHtml } from "@/lib/payroll/onboarding-invite-email";

// POST /api/onboarding-invites/[id]/resend — admin/hr only. Rotates the token (the old link
// stops working the instant this runs) and re-sends the email. Allowed from any status except
// "approved" — including "revoked" (this is how you un-revoke one) and "submitted"/"rejected"
// (re-sending doesn't discard that context, it's just a fresh link to the same in-progress record).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id } = await params;

    const invite = await db.onboardingInvite.findUnique({ where: { id }, include: { employee: true } });
    if (!invite) return apiError("Onboarding invite not found", 404);
    if (!canResendOrRevoke(invite.status)) {
      return apiError("Cannot resend — this onboarding has already been approved.", 409);
    }

    const nextStatus = invite.status === "revoked" ? "in_progress" : undefined;
    const rawToken = await rotateInviteToken(invite.id, nextStatus);

    await logAudit({ session, action: "update", entity: "OnboardingInvite", entityId: invite.id, details: { resent: true } });

    const company = await db.company.findFirst({ orderBy: { createdAt: "asc" } });
    const inviteUrl = `${request.nextUrl.origin}/onboard/${rawToken}`;
    let previewUrl: string | null = null;
    try {
      const updated = await db.onboardingInvite.findUniqueOrThrow({ where: { id: invite.id } });
      const html = buildOnboardingInviteEmailHtml({
        employee: { firstName: invite.employee.firstName, lastName: invite.employee.lastName, designation: invite.employee.designation, department: invite.employee.department, dateOfJoining: invite.employee.dateOfJoining },
        company: { name: company?.name ?? "PayrollPro" },
        inviteUrl,
        expiresAt: updated.expiresAt,
      });
      const result = await sendEmail({ to: invite.employee.email, subject: `Reminder: Complete Your Onboarding at ${company?.name ?? "the company"}`, html });
      previewUrl = result.previewUrl;
    } catch (emailError) {
      console.error("Failed to resend onboarding invite email:", emailError);
    }

    return NextResponse.json({ data: { inviteUrl, previewUrl } });
  } catch (error) {
    return handleApiError(error, "resend onboarding invite");
  }
}
