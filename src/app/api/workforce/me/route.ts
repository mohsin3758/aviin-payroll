import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-utils";
import { visibleAssignments } from "@/lib/workforce/scope-server";
import { loadContext } from "@/lib/workforce/daily";
import { localDay } from "@/lib/workforce/time";
import { contractorActionSchema, performContractorAction } from "@/lib/workforce/actions";
import { workforceError } from "@/lib/workforce/route-helpers";

/** The contractor's own view of today: one entry per live assignment. Own assignments only. */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    if (session.role !== "employee" || !session.employeeId) return NextResponse.json({ data: [] });
    const assignments = await visibleAssignments(session, { status: "active" });
    const out: Record<string, unknown>[] = [];
    for (const a of assignments) {
      const ctx = await loadContext(a.id);
      if (!ctx) continue;
      const day = localDay(new Date(), ctx.tzOffsetMinutes);
      const daily = await db.dailyStatus.findUnique({ where: { assignmentId_date: { assignmentId: a.id, date: day } } });
      const pendingPulse = await db.workforceMessage.count({
        where: { assignmentId: a.id, date: day, type: "STILL_ONLINE", direction: "out", status: { in: ["sent", "delivered", "read"] } },
      });
      out.push({
        assignmentId: a.id,
        project: a.project.name,
        client: a.project.client.name,
        date: day.toISOString().slice(0, 10),
        shiftStart: ctx.resolved.settings.shiftStart,
        shiftEnd: ctx.resolved.settings.shiftEnd,
        eodMode: ctx.resolved.settings.eodMode,
        status: daily
          ? {
              state: daily.state, checkInAt: daily.checkInAt, checkOutAt: daily.checkOutAt, hoursWorked: daily.hoursWorked,
              eodDone: !!daily.eodAt, clientConfirm: daily.clientConfirm, closed: daily.closed,
              reasons: daily.evaluation ? (JSON.parse(daily.evaluation).reasons ?? []) : [],
            }
          : null,
        pulsePending: pendingPulse > 0,
      });
    }
    return NextResponse.json({ data: out });
  } catch (error) {
    return workforceError(error, "fetch my workday");
  }
}

// POST /api/workforce/me — { assignmentId, action: "checkin"|"checkout"|"pulse"|"eod", ... }
// The assignment must be the caller's own; anything else is a 404, never a 403.
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const body = await request.json();
    const assignmentId = typeof body?.assignmentId === "string" ? body.assignmentId : "";
    if (!assignmentId) return apiError("assignmentId is required.", 400);
    const own = await db.assignment.findUnique({ where: { id: assignmentId }, select: { employeeId: true } });
    if (!own || !session.employeeId || own.employeeId !== session.employeeId) return apiError("Assignment not found", 404);

    const parsed = contractorActionSchema.parse(body);
    const result = await performContractorAction(assignmentId, parsed, "portal", { session, label: `contractor:${session.userId}` });
    return NextResponse.json({ data: { state: result.daily.state, reasons: result.result?.reasons ?? [] } });
  } catch (error) {
    return workforceError(error, "contractor action");
  }
}
