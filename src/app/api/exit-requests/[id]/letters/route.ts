import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePayrollFeature, assertEmployeeInScope } from "@/lib/payroll-access";
import { apiError, handleApiError } from "@/lib/api-utils";
import { getOnboardingLetterData, OnboardingLetterError } from "@/lib/payroll/onboarding-letter";
import { buildOnboardingLetterHtml } from "@/lib/payroll/onboarding-letter-email";
import { sendEmail } from "@/lib/mailer";
import { saveUploadedFile } from "@/lib/documents";
import { logAudit } from "@/lib/audit";

const letterSchema = z.object({ letterType: z.enum(["experience", "relieving"]) });

// POST /api/exit-requests/[id]/letters — admin/hr only. Generates and emails an experience or
// relieving letter, saving a copy as an EmployeeDocument.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session, restriction } = await requirePayrollFeature(request, ["admin", "hr"], "manage_exit_management");
    const body = await request.json();
    const { letterType } = letterSchema.parse(body);

    const exitRequest = await db.exitRequest.findUnique({ where: { id } });
    if (!exitRequest) return apiError("Exit request not found", 404);
    assertEmployeeInScope(restriction, exitRequest.employeeId);

    const data = await getOnboardingLetterData(exitRequest.employeeId);
    const html = buildOnboardingLetterHtml(data, letterType);
    const title = letterType === "experience" ? "Experience Letter" : "Relieving Letter";

    // The letter is still generated and saved as a document even if the email fails to send —
    // losing a legally-relevant letter just because SMTP hiccuped would be worse than a failed
    // email. But the failure must be visible to the caller (emailSent below), not swallowed:
    // a silent catch here previously made a real send failure indistinguishable from success.
    let previewUrl: string | null = null;
    let emailSent = false;
    try {
      const result = await sendEmail({ to: data.employee.email, subject: `${title} — ${data.company.name}`, html });
      previewUrl = result.previewUrl;
      emailSent = true;
    } catch (emailError) {
      console.error("Failed to send exit letter email:", emailError);
    }

    const fileName = `${letterType}-letter-${data.employee.code}.html`;
    const { filePath } = await saveUploadedFile(Buffer.from(html, "utf-8"), fileName);
    const doc = await db.employeeDocument.create({
      data: {
        employeeId: exitRequest.employeeId,
        docType: letterType === "experience" ? "experience_letter" : "relieving_letter",
        fileName,
        filePath,
        mimeType: "text/html",
        uploadedBy: session.userId,
        verifiedStatus: "verified",
        verifiedBy: session.userId,
        verifiedAt: new Date(),
      },
    });

    await logAudit({ session, action: "create", entity: "EmployeeDocument", entityId: doc.id, details: { letterType, exitRequestId: id } });

    return NextResponse.json({ data: { document: doc, previewUrl, emailSent } }, { status: 201 });
  } catch (error) {
    if (error instanceof OnboardingLetterError) {
      return apiError(error.message, error.status);
    }
    return handleApiError(error, "generate exit letter");
  }
}
