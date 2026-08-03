import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/mailer";
import { notifyEmployee } from "@/lib/notifications";
import { canReview, rotateInviteToken } from "@/lib/onboarding-invite";
import { reviewInviteSchema } from "@/lib/validations/onboarding-invite";

// POST /api/onboarding-invites/[id]/review — admin/hr only. { decision: "approved"|"rejected",
// reason? }. Only a "submitted" invite can be reviewed (see canReview's transition table).
// Approve: flips Employee.onboardingStatus -> "active" and the invite -> "approved" together.
// Reject: the invite reopens for the candidate to fix and resubmit, which means its token must
// be rotated here (the raw token is never persisted, so the *previous* link is already dead —
// re-sending a "please fix this" email pointing at a dead link would be a genuine bug).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id } = await params;
    const body = await request.json();
    const { decision, reason } = reviewInviteSchema.parse(body);

    const invite = await db.onboardingInvite.findUnique({ where: { id }, include: { employee: true } });
    if (!invite) return apiError("Onboarding invite not found", 404);
    if (!canReview(invite.status, decision)) {
      return apiError(`Cannot ${decision === "approved" ? "approve" : "reject"} an invite with status "${invite.status}".`, 409);
    }

    if (decision === "approved") {
      await db.$transaction([
        db.onboardingInvite.update({ where: { id }, data: { status: "approved", reviewedBy: session.userId, reviewedAt: new Date() } }),
        db.employee.update({ where: { id: invite.employeeId }, data: { onboardingStatus: "active" } }),
      ]);

      await logAudit({ session, action: "update", entity: "OnboardingInvite", entityId: id, details: { decision: "approved" } });

      return NextResponse.json({ data: { status: "approved" } });
    }

    // Rejected: reopen for correction — rotate the token in the same update as the status flip.
    const rawToken = await rotateInviteToken(id, "rejected");
    await db.onboardingInvite.update({ where: { id }, data: { reviewedBy: session.userId, reviewedAt: new Date(), rejectionReason: reason } });

    await logAudit({ session, action: "update", entity: "OnboardingInvite", entityId: id, details: { decision: "rejected", reason } });

    const inviteUrl = `${request.nextUrl.origin}/onboard/${rawToken}`;
    let previewUrl: string | null = null;
    try {
      const company = await db.company.findFirst({ orderBy: { createdAt: "asc" } });
      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#222;line-height:1.6;">
          <h2 style="color:#059669;">A few corrections needed</h2>
          <p>Hi ${invite.employee.firstName},</p>
          <p>Thanks for submitting your onboarding details. HR has asked for a few corrections before it can be approved:</p>
          <p style="background:#fef3c7;border-radius:6px;padding:12px 16px;color:#92400e;">${reason}</p>
          <div style="text-align:center;margin:24px 0;">
            <a href="${inviteUrl}" style="background:#059669;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:bold;display:inline-block;">Update Your Details</a>
          </div>
          <p>Warm regards,<br/>Human Resources<br/>${company?.name ?? "PayrollPro"}</p>
        </div>`;
      const result = await sendEmail({ to: invite.employee.email, subject: "Action needed: your onboarding submission", html });
      previewUrl = result.previewUrl;
    } catch (emailError) {
      console.error("Failed to send onboarding rejection email:", emailError);
    }

    // The employee has no portal login yet (per this feature's design — activation is a
    // separate manual step), so notifyEmployee is a safe no-op here; the email above is the
    // real notification channel for a not-yet-activated new joiner.
    await notifyEmployee(invite.employeeId, {
      title: "Onboarding needs corrections",
      message: reason ?? "HR requested corrections to your onboarding submission.",
      category: "onboarding",
    });

    return NextResponse.json({ data: { status: "rejected", inviteUrl, previewUrl } });
  } catch (error) {
    return handleApiError(error, "review onboarding invite");
  }
}
