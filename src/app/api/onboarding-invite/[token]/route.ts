import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { InviteAccessError, resolveInviteByToken } from "@/lib/onboarding-invite";
import { onboardingSubmissionSchema } from "@/lib/validations/onboarding-invite";

// GET /api/onboarding-invite/[token] — PUBLIC, token-authenticated (no session — this route is
// allow-listed in src/middleware.ts). Returns invite status, the prefilled Employee fields the
// candidate can edit, and uploaded-document metadata only (never file bytes).
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const invite = await resolveInviteByToken(token, "read");

    const documents = await db.employeeDocument.findMany({
      where: { employeeId: invite.employeeId },
      select: { id: true, docType: true, fileName: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    const { salaryStructure: _salaryStructure, ...employee } = invite.employee;
    void _salaryStructure; // never exposed to the candidate

    return NextResponse.json({
      data: {
        status: invite.status,
        expiresAt: invite.expiresAt,
        rejectionReason: invite.status === "rejected" ? invite.rejectionReason : null,
        employee,
        documents,
      },
    });
  } catch (error) {
    if (error instanceof InviteAccessError) return apiError(error.message, error.status);
    return handleApiError(error, "fetch onboarding invite");
  }
}

// PATCH /api/onboarding-invite/[token] — PUBLIC. Updates the candidate-editable Employee field
// subset. First successful call flips a fresh invite from "sent" to "in_progress".
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const invite = await resolveInviteByToken(token, "write");

    const body = await request.json();
    const parsed = onboardingSubmissionSchema.parse(body);

    const employee = await db.employee.update({
      where: { id: invite.employeeId },
      data: parsed,
    });

    if (invite.status === "sent") {
      await db.onboardingInvite.update({ where: { id: invite.id }, data: { status: "in_progress" } });
    }

    await logAudit({ session: null, action: "update", entity: "OnboardingInvite", entityId: invite.id, details: { selfService: true } });

    return NextResponse.json({ data: employee });
  } catch (error) {
    if (error instanceof InviteAccessError) return apiError(error.message, error.status);
    return handleApiError(error, "update onboarding submission");
  }
}
