import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { reviewRegularizationSchema } from "@/lib/validations/attendance-regularization";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { effectiveSessions, sumSessionHours, type PunchSession } from "@/lib/attendance-punch";

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

    // Merge the requested correction into the day's actual session history (rather than
    // collapsing it to one pair) so this only ever patches the specific missing punch —
    // any other sessions already recorded that day are left untouched.
    const sessions: PunchSession[] = existingAttendance ? effectiveSessions(existingAttendance) : [];
    const lastIndex = sessions.length - 1;
    const lastOpen = lastIndex >= 0 && !sessions[lastIndex].punchOut;

    if (existing.requestedPunchIn && existing.requestedPunchOut) {
      if (existing.requestedPunchOut < existing.requestedPunchIn) {
        return apiError("Resulting punchOut would be before punchIn — check the request.", 400);
      }
      sessions.push({
        punchIn: existing.requestedPunchIn.toISOString(),
        punchOut: existing.requestedPunchOut.toISOString(),
        punchInMethod: "manual",
        punchOutMethod: "manual",
      });
    } else if (existing.requestedPunchIn) {
      sessions.push({ punchIn: existing.requestedPunchIn.toISOString(), punchOut: null, punchInMethod: "manual", punchOutMethod: null });
    } else if (existing.requestedPunchOut) {
      if (lastOpen) {
        if (new Date(sessions[lastIndex].punchIn) > existing.requestedPunchOut) {
          return apiError("Resulting punchOut would be before punchIn — check the request.", 400);
        }
        sessions[lastIndex] = { ...sessions[lastIndex], punchOut: existing.requestedPunchOut.toISOString(), punchOutMethod: "manual" };
      } else {
        // No open session to close (e.g. an admin-created record already fully closed) —
        // append a same-instant open+closed session so the requested punch-out is still
        // reflected somewhere rather than silently dropped.
        sessions.push({ punchIn: existing.requestedPunchOut.toISOString(), punchOut: existing.requestedPunchOut.toISOString(), punchInMethod: "manual", punchOutMethod: "manual" });
      }
    }

    const finalPunchIn = sessions.length > 0 ? new Date(sessions[0].punchIn) : null;
    const lastSession = sessions.length > 0 ? sessions[sessions.length - 1] : null;
    const finalPunchOut = lastSession?.punchOut ? new Date(lastSession.punchOut) : null;
    const totalHours = sessions.length > 0 ? sumSessionHours(sessions) : null;

    const [, updated] = await db.$transaction([
      db.attendance.upsert({
        where: { employeeId_date: { employeeId: existing.employeeId, date: existing.date } },
        create: {
          employeeId: existing.employeeId,
          date: existing.date,
          punchIn: finalPunchIn,
          punchOut: finalPunchOut,
          punchInMethod: sessions[0]?.punchInMethod ?? null,
          punchOutMethod: lastSession?.punchOutMethod ?? null,
          status: finalPunchIn ? "present" : "absent",
          totalHours,
          punchSessions: JSON.stringify(sessions),
          notes: `Applied from regularization request: ${existing.reason}`,
        },
        update: {
          punchIn: finalPunchIn ?? undefined,
          punchOut: finalPunchOut,
          punchInMethod: sessions[0]?.punchInMethod ?? undefined,
          punchOutMethod: lastSession?.punchOutMethod ?? undefined,
          status: finalPunchIn ? "present" : undefined,
          totalHours: totalHours ?? undefined,
          punchSessions: JSON.stringify(sessions),
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
