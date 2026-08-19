import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";
import { requirePayrollFeature, requirePayrollSelfOrFeature, assertEmployeeInScope } from "@/lib/payroll-access";
import { logAudit } from "@/lib/audit";
import { notifyEmployee } from "@/lib/notifications";

// GET /api/wfh/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const wfhRequest = await db.wfhRequest.findUnique({
      where: { id },
      include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
    });

    if (!wfhRequest) {
      return apiError("WFH request not found", 404);
    }

    await requirePayrollSelfOrFeature(request, wfhRequest.employeeId, ["admin", "hr", "manager"], "manage_wfh");

    return NextResponse.json(wfhRequest);
  } catch (error) {
    return handleApiError(error, "fetch WFH request");
  }
}

// PUT /api/wfh/[id] - Approve or reject a WFH request (idempotent: only from "pending"). Once
// approved, recordPunch() (src/lib/attendance-punch.ts) skips the geofence check for this
// employee on every day inside [startDate, endDate], checked live at punch time.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { session, restriction } = await requirePayrollFeature(request, ["admin", "hr", "manager"], "manage_wfh");
    const { id } = await params;
    const body = await request.json();
    const { status, approvedBy } = body;

    if (!["approved", "rejected"].includes(status)) {
      return apiError("Invalid status. Must be 'approved' or 'rejected'.", 400);
    }

    const existing = await db.wfhRequest.findUnique({ where: { id } });

    if (!existing) {
      return apiError("WFH request not found", 404);
    }
    assertEmployeeInScope(restriction, existing.employeeId);

    if (existing.status !== "pending") {
      return apiError(
        `Cannot ${status === "approved" ? "approve" : "reject"} a WFH request that is already "${existing.status}". Only pending requests can be actioned.`,
        409
      );
    }

    // Re-check status to close the race window between the findUnique above and this write.
    const updated = await db.$transaction(async (tx) => {
      const current = await tx.wfhRequest.findUnique({ where: { id } });
      if (!current || current.status !== "pending") {
        throw new Error("CONFLICT_ALREADY_ACTIONED");
      }
      return tx.wfhRequest.update({
        where: { id },
        data:
          status === "approved"
            ? { status: "approved", approvedBy: approvedBy ?? null, approvedAt: new Date() }
            : { status: "rejected", approvedBy: approvedBy ?? null },
        include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
      });
    });

    await logAudit({
      session,
      action: status === "approved" ? "approve" : "reject",
      entity: "WfhRequest",
      entityId: id,
      details: { approvedBy },
    });

    await notifyEmployee(updated.employeeId, {
      title: status === "approved" ? "WFH request approved" : "WFH request rejected",
      message:
        status === "approved"
          ? `Your work-from-home request (${updated.totalDays} day${updated.totalDays === 1 ? "" : "s"}) was approved.`
          : `Your work-from-home request (${updated.totalDays} day${updated.totalDays === 1 ? "" : "s"}) was not approved.`,
      category: "wfh",
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "CONFLICT_ALREADY_ACTIONED") {
      return apiError("This WFH request was already actioned by someone else. Refresh and retry.", 409);
    }
    return handleApiError(error, "update WFH request");
  }
}

// DELETE /api/wfh/[id] - Cancel a WFH request. requirePayrollSelfOrFeature covers both an
// employee cancelling their own pending request and admin/hr/manager cancelling on their behalf
// in one call, so there's no separate ess-only wrapper route for this (unlike leaves, whose
// shared DELETE has no self-check at all).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.wfhRequest.findUnique({ where: { id } });

    if (!existing) {
      return apiError("WFH request not found", 404);
    }

    const { session } = await requirePayrollSelfOrFeature(request, existing.employeeId, ["admin", "hr", "manager"], "manage_wfh");

    if (existing.status === "cancelled") {
      return apiError("This WFH request is already cancelled.", 409);
    }

    const cancelled = await db.wfhRequest.update({
      where: { id },
      data: { status: "cancelled" },
      include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
    });

    await logAudit({ session, action: "cancel", entity: "WfhRequest", entityId: id });

    return NextResponse.json(cancelled);
  } catch (error) {
    return handleApiError(error, "cancel WFH request");
  }
}
