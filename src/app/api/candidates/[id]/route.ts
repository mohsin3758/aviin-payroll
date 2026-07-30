import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateCandidateSchema } from "@/lib/validations/candidate";
import { apiError, handleApiError } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { computeBillingAmount } from "@/lib/candidate-billing";

const RECRUITER_SUMMARY = { select: { firstName: true, lastName: true, employeeCode: true } } as const;

type Params = { params: Promise<{ id: string }> };

// PUT /api/candidates/[id] — admin/hr only. Typically used to record an end date (contract
// ended / placement over), billing/payment details, or correct other details.
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id } = await params;

    const existing = await db.candidate.findUnique({ where: { id } });
    if (!existing) {
      return apiError("Candidate not found", 404);
    }

    const body = await request.json();
    const parsed = updateCandidateSchema.parse(body);

    const candidate = await db.candidate.update({
      where: { id },
      data: parsed,
      include: { recruiter: RECRUITER_SUMMARY },
    });

    await logAudit({ session, action: "update", entity: "Candidate", entityId: id });

    return NextResponse.json({ ...candidate, billingAmount: computeBillingAmount(candidate) });
  } catch (error) {
    return handleApiError(error, "update candidate");
  }
}

// DELETE /api/candidates/[id] — admin/hr only. Blocked if a hiring incentive already references
// this candidate (delete/cancel that first) — never silently orphan a real incentive record.
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id } = await params;

    const existing = await db.candidate.findUnique({ where: { id }, include: { hiringIncentive: true } });
    if (!existing) {
      return apiError("Candidate not found", 404);
    }
    if (existing.hiringIncentive) {
      return apiError("This candidate has a hiring incentive on record and cannot be deleted. Cancel the incentive first if needed.", 400);
    }

    await db.candidate.delete({ where: { id } });

    await logAudit({ session, action: "delete", entity: "Candidate", entityId: id });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "delete candidate");
  }
}
