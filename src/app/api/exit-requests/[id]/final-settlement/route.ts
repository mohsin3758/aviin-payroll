import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePayrollFeature, assertEmployeeInScope } from "@/lib/payroll-access";
import { apiError, handleApiError } from "@/lib/api-utils";
import { computeFinalSettlement, FinalSettlementError } from "@/lib/payroll/final-settlement";
import { logAudit } from "@/lib/audit";

const computeSchema = z.object({ actualLastWorkingDate: z.coerce.date().nullable().optional() });

// POST /api/exit-requests/[id]/final-settlement — admin/hr only. (Re)computes the settlement
// as a draft — safe to call repeatedly before finalizing.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { session, restriction } = await requirePayrollFeature(request, ["admin", "hr"], "manage_exit_management");
    const body = await request.json().catch(() => ({}));
    const { actualLastWorkingDate } = computeSchema.parse(body);

    const exitRequest = await db.exitRequest.findUnique({ where: { id } });
    if (!exitRequest) return apiError("Exit request not found", 404);
    assertEmployeeInScope(restriction, exitRequest.employeeId);
    if (exitRequest.status !== "approved") {
      return apiError("Final settlement can only be computed for an approved exit request.", 409);
    }

    const existingFinal = await db.finalSettlement.findUnique({ where: { exitRequestId: id } });
    if (existingFinal?.status === "finalized" || existingFinal?.status === "paid") {
      return apiError("This settlement has already been finalized and cannot be recomputed.", 409);
    }

    const computed = await computeFinalSettlement(id, actualLastWorkingDate ?? undefined);

    const settlement = await db.finalSettlement.upsert({
      where: { exitRequestId: id },
      create: {
        exitRequestId: id,
        employeeId: exitRequest.employeeId,
        leaveEncashmentAmount: computed.leaveEncashmentAmount,
        pendingArrearsAmount: computed.pendingArrearsAmount,
        gratuityAmount: computed.gratuityAmount,
        loanRecoveryAmount: computed.loanRecoveryAmount,
        noticeShortfallAmount: computed.noticeShortfallAmount,
        netSettlementAmount: computed.netSettlementAmount,
      },
      update: {
        leaveEncashmentAmount: computed.leaveEncashmentAmount,
        pendingArrearsAmount: computed.pendingArrearsAmount,
        gratuityAmount: computed.gratuityAmount,
        loanRecoveryAmount: computed.loanRecoveryAmount,
        noticeShortfallAmount: computed.noticeShortfallAmount,
        netSettlementAmount: computed.netSettlementAmount,
      },
    });

    await logAudit({ session, action: "update", entity: "FinalSettlement", entityId: settlement.id, details: { net: computed.netSettlementAmount } });

    return NextResponse.json({ data: { ...settlement, gratuityEligible: computed.gratuityEligible, gratuityCompletedYears: computed.gratuityCompletedYears } });
  } catch (error) {
    if (error instanceof FinalSettlementError) {
      return apiError(error.message, error.status);
    }
    return handleApiError(error, "compute final settlement");
  }
}
