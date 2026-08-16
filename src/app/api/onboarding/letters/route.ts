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

const letterSchema = z.object({
  employeeId: z.string().min(1),
  letterType: z.enum(["offer", "appointment"]),
});

// POST /api/onboarding/letters — admin/hr only. Generates the letter, emails it to the
// employee, and saves a copy as an EmployeeDocument for record-keeping.
export async function POST(request: NextRequest) {
  try {
    const { session, restriction } = await requirePayrollFeature(request, ["admin", "hr"], "manage_onboarding");
    const body = await request.json();
    const { employeeId, letterType } = letterSchema.parse(body);
    assertEmployeeInScope(restriction, employeeId);

    const data = await getOnboardingLetterData(employeeId);
    const html = buildOnboardingLetterHtml(data, letterType);
    const title = letterType === "offer" ? "Offer Letter" : "Appointment Letter";

    let previewUrl: string | null = null;
    try {
      const result = await sendEmail({ to: data.employee.email, subject: `${title} — ${data.company.name}`, html });
      previewUrl = result.previewUrl;
    } catch (emailError) {
      console.error("Failed to send onboarding letter email:", emailError);
    }

    const fileName = `${letterType}-letter-${data.employee.code}.html`;
    const { filePath } = await saveUploadedFile(Buffer.from(html, "utf-8"), fileName);
    const doc = await db.employeeDocument.create({
      data: {
        employeeId,
        docType: letterType === "offer" ? "offer_letter" : "appointment_letter",
        fileName,
        filePath,
        mimeType: "text/html",
        uploadedBy: session.userId,
        verifiedStatus: "verified",
        verifiedBy: session.userId,
        verifiedAt: new Date(),
      },
    });

    await logAudit({ session, action: "create", entity: "EmployeeDocument", entityId: doc.id, details: { letterType } });

    return NextResponse.json({ data: { document: doc, html, previewUrl } }, { status: 201 });
  } catch (error) {
    if (error instanceof OnboardingLetterError) {
      return apiError(error.message, error.status);
    }
    return handleApiError(error, "generate onboarding letter");
  }
}
