import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { notifyRoles } from "@/lib/notifications";
import { InviteAccessError, resolveInviteByToken } from "@/lib/onboarding-invite";
import { REQUIRED_SUBMISSION_DOC_TYPES, REQUIRED_SUBMISSION_FIELDS } from "@/lib/validations/onboarding-invite";

// POST /api/onboarding-invite/[token]/submit — PUBLIC, token-authenticated. Final step: checks
// every required field + required document type is present, flips the invite to "submitted"
// (locking it from further self-edits — see isEditableStatus), and notifies admin/hr for review.
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const invite = await resolveInviteByToken(token, "write");

    const employee = invite.employee as unknown as Record<string, unknown>;
    const missingFields = REQUIRED_SUBMISSION_FIELDS.filter((f) => employee[f] === null || employee[f] === undefined || employee[f] === "");
    if (missingFields.length > 0) {
      return apiError(`Please complete the following before submitting: ${missingFields.join(", ")}.`, 400);
    }

    const uploadedDocs = await db.employeeDocument.findMany({
      where: { employeeId: invite.employeeId },
      select: { docType: true },
    });
    const uploadedTypes = new Set(uploadedDocs.map((d) => d.docType));
    const missingDocs = REQUIRED_SUBMISSION_DOC_TYPES.filter((t) => !uploadedTypes.has(t));
    if (missingDocs.length > 0) {
      return apiError(`Please upload the following documents before submitting: ${missingDocs.join(", ")}.`, 400);
    }

    await db.onboardingInvite.update({
      where: { id: invite.id },
      data: { status: "submitted", submittedAt: new Date() },
    });

    await logAudit({ session: null, action: "update", entity: "OnboardingInvite", entityId: invite.id, details: { submitted: true } });

    await notifyRoles(["admin", "hr"], {
      title: "Onboarding submission ready for review",
      message: `${invite.employee.firstName} ${invite.employee.lastName ?? ""} has completed their onboarding form.`.trim(),
      category: "onboarding",
      link: "onboarding",
    });

    return NextResponse.json({ data: { status: "submitted" } });
  } catch (error) {
    if (error instanceof InviteAccessError) return apiError(error.message, error.status);
    return handleApiError(error, "submit onboarding form");
  }
}
