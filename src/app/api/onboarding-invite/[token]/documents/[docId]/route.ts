import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { deleteUploadedFile } from "@/lib/documents";
import { InviteAccessError, resolveInviteByToken } from "@/lib/onboarding-invite";

// DELETE /api/onboarding-invite/[token]/documents/[docId] — PUBLIC, token-authenticated. Lets
// the candidate remove a wrong upload before submitting and re-upload the correct file, rather
// than being stuck with a mistaken document forever (the same create-but-no-delete gap fixed
// for Assets/Shifts/Holidays earlier this session — not repeating it here from the start).
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ token: string; docId: string }> }) {
  try {
    const { token, docId } = await params;
    const invite = await resolveInviteByToken(token, "write");

    const doc = await db.employeeDocument.findUnique({ where: { id: docId } });
    if (!doc || doc.employeeId !== invite.employeeId) {
      return apiError("Document not found", 404);
    }

    await db.employeeDocument.delete({ where: { id: docId } });
    await deleteUploadedFile(doc.filePath);

    await logAudit({ session: null, action: "delete", entity: "EmployeeDocument", entityId: docId, details: { docType: doc.docType, selfService: true } });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof InviteAccessError) return apiError(error.message, error.status);
    return handleApiError(error, "delete onboarding document");
  }
}
