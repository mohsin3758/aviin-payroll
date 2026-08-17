import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";
import { requirePayrollFeature, requirePayrollSelfOrFeature, assertEmployeeInScope } from "@/lib/payroll-access";
import { logAudit } from "@/lib/audit";
import { notifyEmployee } from "@/lib/notifications";
import { sendEmail } from "@/lib/mailer";
import { buildLeaveApprovalEmailHtml } from "@/lib/payroll/leave-approval-email";
import { getEffectiveWhatsappConfig, sendWhatsappTemplate } from "@/lib/whatsapp";

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

    await requirePayrollSelfOrFeature(request, leaveApplication.employeeId, ["admin", "hr", "manager"], "manage_leave_management");

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
    const { session, restriction } = await requirePayrollFeature(request, ["admin", "hr", "manager"], "manage_leave_management");
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
    assertEmployeeInScope(restriction, existing.employeeId);

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
            employee: { select: { firstName: true, lastName: true, employeeCode: true, email: true, phone: true } },
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

      // A durable, external record of the approval — emailed to the employee on top of (not
      // instead of) the in-app notification above. Never blocks the approval itself: a failed
      // send is logged, not surfaced as an approval failure.
      if (result.employee.email) {
        try {
          const company = await db.company.findFirst({ orderBy: { createdAt: "asc" } });
          const html = buildLeaveApprovalEmailHtml({
            employee: { name: `${result.employee.firstName} ${result.employee.lastName ?? ""}`.trim(), code: result.employee.employeeCode },
            company: { name: company?.name ?? "PayrollPro" },
            leaveType: result.leaveType.name,
            startDate: result.startDate,
            endDate: result.endDate,
            totalDays: result.totalDays,
            approvedAt: result.approvedAt ?? new Date(),
            approvedByName: session.name,
          });
          await sendEmail({
            to: result.employee.email,
            subject: `Leave Approved — ${result.leaveType.name} (${result.totalDays} day${result.totalDays === 1 ? "" : "s"})`,
            html,
          });
        } catch (emailError) {
          console.error("Failed to send leave approval email:", emailError);
        }
      }

      // Same record-keeping purpose as the email above, over WhatsApp — only fires if an admin
      // has actually configured Meta Cloud API credentials in Settings; a no-op otherwise. Also
      // never blocks the approval: a failed send (including "template not approved yet") is
      // logged, not surfaced as an approval failure.
      if (result.employee.phone) {
        try {
          const whatsappConfig = await getEffectiveWhatsappConfig();
          if (whatsappConfig) {
            await sendWhatsappTemplate(whatsappConfig, result.employee.phone, [
              `${result.employee.firstName} ${result.employee.lastName ?? ""}`.trim(),
              result.leaveType.name,
              result.startDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
              result.endDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
              String(result.totalDays),
              session.name,
            ]);
          }
        } catch (whatsappError) {
          console.error("Failed to send leave approval WhatsApp message:", whatsappError);
        }
      }

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

    const { session } = await requirePayrollSelfOrFeature(request, existing.employeeId, ["admin", "hr", "manager"], "manage_leave_management");

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
