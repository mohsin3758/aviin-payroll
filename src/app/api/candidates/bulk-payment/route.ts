import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

const bulkPaymentSchema = z.object({
  candidateIds: z.array(z.string().min(1)).min(1).max(200),
});

// PATCH /api/candidates/bulk-payment — admin only (client billing/payment is admin-only
// everywhere else, this is no exception). Marks the given candidates' one-time placement fee
// as received. Silently no-ops candidates with no billing charge configured (nothing to mark
// received) rather than erroring the whole batch over one bad row.
export async function PATCH(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin"]);
    const body = await request.json();
    const { candidateIds } = bulkPaymentSchema.parse(body);

    const candidates = await db.candidate.findMany({
      where: { id: { in: candidateIds }, billingType: { not: null } },
      select: { id: true, paymentReceived: true },
    });
    const eligibleIds = candidates.filter((c) => !c.paymentReceived).map((c) => c.id);

    if (eligibleIds.length === 0) {
      return apiError("None of the selected candidates have an unpaid billing charge to mark as received.", 400);
    }

    await db.candidate.updateMany({
      where: { id: { in: eligibleIds } },
      data: { paymentReceived: true },
    });

    await logAudit({
      session,
      action: "update",
      entity: "Candidate",
      details: { bulkPaymentReceived: eligibleIds },
    });

    return NextResponse.json({ updated: eligibleIds.length, skipped: candidateIds.length - eligibleIds.length });
  } catch (error) {
    return handleApiError(error, "bulk update candidate payments");
  }
}
