import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { apiError } from "@/lib/api-utils";
import { assertAssignmentAccess, workforceError } from "@/lib/workforce/route-helpers";

// GET /api/workforce/days/[id] — one day in full: the rules engine's reasons, the message
// timeline, corrections, disputes and exceptions. Visible to the assignment's admin/hr/coordinator
// and to the contractor themself.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(request);
    const { id } = await params;
    const day = await db.dailyStatus.findUnique({ where: { id }, include: { corrections: true, disputes: true } });
    if (!day) return apiError("Not found", 404);
    await assertAssignmentAccess(session, day.assignmentId);

    const [messages, exceptions] = await Promise.all([
      db.workforceMessage.findMany({ where: { assignmentId: day.assignmentId, date: day.date }, orderBy: { createdAt: "asc" } }),
      db.exceptionCase.findMany({ where: { assignmentId: day.assignmentId, date: day.date }, orderBy: { createdAt: "asc" } }),
    ]);
    return NextResponse.json({
      data: {
        ...day,
        evaluation: day.evaluation ? JSON.parse(day.evaluation) : null,
        messages: messages.map((m) => ({ id: m.id, type: m.type, direction: m.direction, channel: m.channel, status: m.status, suppressReason: m.suppressReason, failureReason: m.failureReason, sentAt: m.sentAt, createdAt: m.createdAt })),
        exceptions,
      },
    });
  } catch (error) {
    return workforceError(error, "fetch day detail");
  }
}
