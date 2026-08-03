import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { InviteAccessError, resolveInviteByToken } from "@/lib/onboarding-invite";
import { saveDocumentForEmployee, DocumentUploadError, ONBOARDING_DOC_TYPES } from "@/lib/documents";

// POST /api/onboarding-invite/[token]/documents — PUBLIC, token-authenticated. Multipart
// (file, docType). docType is restricted to ONBOARDING_DOC_TYPES, a deliberately narrower set
// than what an authenticated admin/hr session may upload (e.g. a candidate can never self-file
// an "offer_letter", which the generated-letters feature treats as HR-authored).
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const invite = await resolveInviteByToken(token, "write");

    const formData = await request.formData();
    const file = formData.get("file");
    const docType = formData.get("docType");

    if (!(file instanceof File)) {
      return apiError("file is required", 400);
    }
    if (typeof docType !== "string") {
      return apiError(`docType must be one of: ${ONBOARDING_DOC_TYPES.join(", ")}`, 400);
    }

    const doc = await saveDocumentForEmployee({
      employeeId: invite.employeeId,
      file,
      docType,
      uploadedBy: null,
      allowedDocTypes: ONBOARDING_DOC_TYPES,
    });

    if (invite.status === "sent") {
      await db.onboardingInvite.update({ where: { id: invite.id }, data: { status: "in_progress" } });
    }

    await logAudit({ session: null, action: "create", entity: "EmployeeDocument", entityId: doc.id, details: { docType, selfService: true } });

    return NextResponse.json({ data: doc }, { status: 201 });
  } catch (error) {
    if (error instanceof InviteAccessError) return apiError(error.message, error.status);
    if (error instanceof DocumentUploadError) return apiError(error.message, error.status);
    return handleApiError(error, "upload onboarding document");
  }
}
