import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { reviewRegularizationSchema } from "@/lib/validations/attendance-regularization";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";

// PUT /api/attendance-regularizations/[id] — admin/hr/manager approves or rejects. Approval
// applies the requested punch time(s) onto the real Attendance record for that date (creating
// it if none exists yet, or filling in only the field(s) that were actually requested).
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr", "manager"]);
    const { id } = await params;
    const body = await request.json();
    const { approved, comment } = reviewRegularizationSchema.parse(body);

    const existing = await db.attendanceRegularizationRequest.findUnique({
      where: { id },
      include: { employee: { select: { id: true, firstName: true, lastName: true, user: { select: { id: true } } } } },
    });
    if (!existing) return apiError("Regularization request not found", 404);
    if (existing.status !== "pending") {
      return apiError(`This request has already been ${existing.status}.`, 409);
    }

    if (!approved) {
      const rejected = await db.attendanceRegularizationRequest.update({
        where: { id },
        data: { status: "rejected", reviewedBy: session.userId, reviewedAt: new Date(), reviewComment: comment ?? null },
      });
      await logAudit({ session, action: "update", entity: "AttendanceRegularizationRequest", entityId: id, details: { toStatus: "rejected" } });
      if (existing.employee.user) {
        await notify({
          userId: existing.employee.user.id,
          title: "Attendance correction rejected",
          message: `Your correction request for ${existing.date.toDateString()} was rejected.`,
          category: "attendance",
          link: "my-portal",
        });
      }
      return NextResponse.json({ data: rejected });
    }

    const existingAttendance = await db.attendance.findUnique({
      where: { employeeId_date: { employeeId: existing.employeeId, date: existing.date } },
    });

    if (!existingAttendance && !existing.requestedPunchIn) {
      return apiError("No existing attendance record for this date, and no punch-in was requested — cannot approve a punch-out-only correction without a punch-in first.", 400);
    }

    const finalPunchIn = existing.requestedPunchIn ?? existingAttendance?.punchIn ?? null;
    const finalPunchOut = existing.requestedPunchOut ?? existingAttendance?.punchOut ?? null;
    let totalHours: number | null = existingAttendance?.totalHours ?? null;
    if (finalPunchIn && finalPunchOut) {
      const diffMs = finalPunchOut.getTime() - finalPunchIn.getTime();
      if (diffMs < 0) return apiError("Resulting punchOut would be before punchIn — check the request.", 400);
      totalHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
    }

    const [, updated] = await db.$transaction([
      db.attendance.upsert({
        where: { employeeId_date: { employeeId: existing.employeeId, date: existing.date } },
        create: {
          employeeId: existing.employeeId,
          date: existing.date,
          punchIn: finalPunchIn,
          punchOut: finalPunchOut,
          punchInMethod: existing.requestedPunchIn ? "manual" : null,
          punchOutMethod: existing.requestedPunchOut ? "manual" : null,
          status: finalPunchIn ? "present" : "absent",
          totalHours,
          notes: `Applied from regularization request: ${existing.reason}`,
        },
        update: {
          punchIn: finalPunchIn ?? undefined,
          punchOut: finalPunchOut ?? undefined,
          punchInMethod: existing.requestedPunchIn ? "manual" : undefined,
          punchOutMethod: existing.requestedPunchOut ? "manual" : undefined,
          status: finalPunchIn ? "present" : undefined,
          totalHours: totalHours ?? undefined,
        },
      }),
      db.attendanceRegularizationRequest.update({
        where: { id },
        data: { status: "approved", reviewedBy: session.userId, reviewedAt: new Date(), reviewComment: comment ?? null },
      }),
    ]);

    await logAudit({ session, action: "update", entity: "AttendanceRegularizationRequest", entityId: id, details: { toStatus: "approved" } });

    if (existing.employee.user) {
      await notify({
        userId: existing.employee.user.id,
        title: "Attendance correction approved",
        message: `Your correction request for ${existing.date.toDateString()} was approved.`,
        category: "attendance",
        link: "my-portal",
      });
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    return handleApiError(error, "review attendance regularization request");
  }
}
