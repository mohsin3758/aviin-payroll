import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";
import { requireRole, requireSelfOrRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { notifyEmployee } from "@/lib/notifications";

// GET /api/leaves/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const leaveApplication = await db.leaveApplication.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            firstName: true,
            lastName: true,
            employeeCode: true,
          },
        },
        leaveType: true,
      },
    });

    if (!leaveApplication) {
      return apiError("Leave application not found", 404);
    }

    await requireSelfOrRole(request, leaveApplication.employeeId, ["admin", "hr", "manager"]);

    return NextResponse.json(leaveApplication);
  } catch (error) {
    return handleApiError(error, "fetch leave application");
  }
}

// PUT /api/leaves/[id] - Approve or reject a leave application (idempotent: only from "pending")
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole(request, ["admin", "hr", "manager"]);
    const { id } = await params;
    const body = await request.json();
    const { status, approvedBy } = body;

    if (!["approved", "rejected"].includes(status)) {
      return apiError("Invalid status. Must be 'approved' or 'rejected'.", 400);
    }

    const existing = await db.leaveApplication.findUnique({ where: { id } });

    if (!existing) {
      return apiError("Leave application not found", 404);
    }

    if (existing.status !== "pending") {
      return apiError(
        `Cannot ${status === "approved" ? "approve" : "reject"} a leave application that is already "${existing.status}". Only pending applications can be actioned.`,
        409
      );
    }

    if (status === "approved") {
      // Update leave application and increment LeaveBalance.used atomically.
      const result = await db.$transaction(async (tx) => {
        // Re-check status inside the transaction to close the race window between
        // the findUnique above and this write (two concurrent approvals of the same app).
        const current = await tx.leaveApplication.findUnique({ where: { id } });
        if (!current || current.status !== "pending") {
          throw new Error("CONFLICT_ALREADY_ACTIONED");
        }

        const updated = await tx.leaveApplication.update({
          where: { id },
          data: {
            status: "approved",
            approvedBy: approvedBy ?? null,
            approvedAt: new Date(),
          },
          include: {
            employee: { select: { firstName: true, lastName: true, employeeCode: true } },
            leaveType: true,
          },
        });

        const year = updated.startDate.getFullYear();

        await tx.leaveBalance.updateMany({
          where: { employeeId: updated.employeeId, leaveTypeId: updated.leaveTypeId, year },
          data: { used: { increment: updated.totalDays } },
        });

        return updated;
      }).catch((err) => {
        if (err instanceof Error && err.message === "CONFLICT_ALREADY_ACTIONED") {
          throw err;
        }
        throw err;
      });

      await logAudit({
        session,
        action: "approve",
        entity: "LeaveApplication",
        entityId: id,
        details: { approvedBy },
      });

      await notifyEmployee(result.employeeId, {
        title: "Leave approved",
        message: `Your ${result.leaveType.name} leave (${result.totalDays} day${result.totalDays === 1 ? "" : "s"}) was approved.`,
        category: "leave",
      });

      return NextResponse.json(result);
    }

    // Rejected: just set status (no balance change since it was never deducted)
    const updated = await db.leaveApplication.update({
      where: { id },
      data: {
        status: "rejected",
        approvedBy: approvedBy ?? null,
      },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeCode: true } },
        leaveType: true,
      },
    });

    await logAudit({ session, action: "reject", entity: "LeaveApplication", entityId: id });

    await notifyEmployee(updated.employeeId, {
      title: "Leave rejected",
      message: `Your ${updated.leaveType.name} leave request (${updated.totalDays} day${updated.totalDays === 1 ? "" : "s"}) was not approved.`,
      category: "leave",
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "CONFLICT_ALREADY_ACTIONED") {
      return apiError("This leave application was already actioned by someone else. Refresh and retry.", 409);
    }
    return handleApiError(error, "update leave application");
  }
}

// DELETE /api/leaves/[id] - Cancel leave (restores LeaveBalance.used if it was previously approved)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.leaveApplication.findUnique({ where: { id } });

    if (!existing) {
      return apiError("Leave application not found", 404);
    }

    const session = await requireSelfOrRole(request, existing.employeeId, ["admin", "hr", "manager"]);

    if (existing.status === "cancelled") {
      return apiError("This leave application is already cancelled.", 409);
    }

    const wasApproved = existing.status === "approved";

    const cancelled = await db.$transaction(async (tx) => {
      const updated = await tx.leaveApplication.update({
        where: { id },
        data: { status: "cancelled" },
        include: {
          employee: { select: { firstName: true, lastName: true, employeeCode: true } },
          leaveType: true,
        },
      });

      if (wasApproved) {
        const year = updated.startDate.getFullYear();
        await tx.leaveBalance.updateMany({
          where: { employeeId: updated.employeeId, leaveTypeId: updated.leaveTypeId, year },
          data: { used: { decrement: updated.totalDays } },
        });
      }

      return updated;
    });

    await logAudit({
      session,
      action: "cancel",
      entity: "LeaveApplication",
      entityId: id,
      details: { restoredBalance: wasApproved, days: existing.totalDays },
    });

    return NextResponse.json(cancelled);
  } catch (error) {
    return handleApiError(error, "cancel leave application");
  }
}
