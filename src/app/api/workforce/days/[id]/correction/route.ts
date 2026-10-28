import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { assertAssignmentAccess, workforceError } from "@/lib/workforce/route-helpers";
import { autoResolve, loadContext, recomputeDay } from "@/lib/workforce/daily";
import { correctionAllowance } from "@/lib/workforce/attendance-rules";
import { addDays } from "@/lib/workforce/time";

const schema = z.object({
  checkInAt: z.coerce.date().optional(),
  checkOutAt: z.coerce.date().optional(),
  reason: z.string().trim().min(5, "Give a reason (at least a few words)").max(1000),
  // The coordinator confirmed with the client that the contractor really worked.
  clientConfirmed: z.boolean(),
  // Past the monthly limit only an admin may proceed, and must say so explicitly.
  adminOverride: z.boolean().optional(),
}).refine((v) => v.checkInAt || v.checkOutAt, { message: "Provide a corrected check-in and/or check-out time." });

// POST /api/workforce/days/[id]/correction — "forgot to check in" fixes. Capped per contractor per
// month (default 2); each needs client confirmation; a further one needs an admin override with a
// written reason. Stores original and new values, requester and approver, and audits it.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr", "manager"]);
    const { id } = await params;
    const day = await db.dailyStatus.findUnique({ where: { id } });
    if (!day) return apiError("Not found", 404);
    await assertAssignmentAccess(session, day.assignmentId);
    if (day.locked) return apiError("This day is locked into a closed month and cannot be corrected.", 409);

    const body = schema.parse(await request.json());
    const ctx = await loadContext(day.assignmentId);
    if (!ctx) return apiError("Not found", 404);

    const monthStart = new Date(Date.UTC(day.date.getUTCFullYear(), day.date.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(day.date.getUTCFullYear(), day.date.getUTCMonth() + 1, 1));
    const used = await db.correction.count({
      where: { dailyStatus: { assignment: { employeeId: ctx.assignment.employeeId }, date: { gte: monthStart, lt: monthEnd } } },
    });
    const allowance = correctionAllowance(used, ctx.resolved.settings.correctionsPerMonth);

    if (!allowance.allowed) {
      if (session.role !== "admin" || !body.adminOverride) {
        return apiError(`This contractor has used all ${ctx.resolved.settings.correctionsPerMonth} corrections for the month. Only an admin can override, with a written reason.`, 409);
      }
    } else if (!body.clientConfirmed && !(session.role === "admin" && body.adminOverride)) {
      return apiError("Confirm with the client that the contractor worked, then tick 'client confirmed'.", 400);
    }

    const checkIn = body.checkInAt ?? day.checkInAt;
    const checkOut = body.checkOutAt ?? day.checkOutAt;
    if (checkIn && checkOut && checkOut < checkIn) return apiError("Check-out cannot be before check-in.", 400);
    // The corrected times must fall on the day being corrected (within a day of its local date).
    for (const t of [body.checkInAt, body.checkOutAt]) {
      if (t && (t < addDays(day.date, -1) || t > addDays(day.date, 2))) return apiError("The corrected time is not on this day.", 400);
    }

    const correction = await db.correction.create({
      data: {
        dailyStatusId: day.id, requestedBy: session.userId, approvedBy: session.role === "admin" || session.role === "hr" ? session.userId : null,
        originalValue: JSON.stringify({ checkInAt: day.checkInAt, checkOutAt: day.checkOutAt }),
        newValue: JSON.stringify({ checkInAt: checkIn, checkOutAt: checkOut }),
        reason: body.reason, clientConfirmed: body.clientConfirmed, adminOverride: !allowance.allowed,
      },
    });
    await db.dailyStatus.update({
      where: { id: day.id },
      data: { checkInAt: checkIn, checkOutAt: checkOut, checkInChannel: body.checkInAt ? "coordinator" : day.checkInChannel },
    });
    const { daily, result } = await recomputeDay(day.id);
    await autoResolve(day.assignmentId, day.date, ["missing_checkin", "unresolved_checkin", "missing_hours", "day_absent"], `coordinator:${session.userId}`, `Corrected: ${body.reason}`);
    await logAudit({ session, action: "attendance_correction", entity: "DailyStatus", entityId: day.id, details: { correctionId: correction.id, overrideUsed: !allowance.allowed, reason: body.reason } });
    return NextResponse.json({ data: { daily, reasons: result?.reasons ?? [], correctionsUsedThisMonth: used + 1, remaining: Math.max(0, allowance.remaining - 1) } }, { status: 201 });
  } catch (error) {
    return workforceError(error, "record correction");
  }
}
