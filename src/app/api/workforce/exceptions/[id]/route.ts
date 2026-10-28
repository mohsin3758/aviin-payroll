import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { assertAssignmentAccess, workforceError } from "@/lib/workforce/route-helpers";
import { isFullAccess } from "@/lib/workforce/access";
import { recomputeDay } from "@/lib/workforce/daily";

const OUTCOMES = ["called", "connected", "no_answer", "callback_requested", "leave", "emergency", "client_issue", "technical_issue", "other"] as const;

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("contacted"), outcome: z.enum(OUTCOMES), note: z.string().trim().max(1000).optional() }),
  z.object({
    action: z.literal("resolve"),
    note: z.string().trim().min(3, "Say how it was resolved").max(1000),
    outcome: z.enum(OUTCOMES).optional(),
    // When the contractor turned out to be on leave, record it so the day isn't counted absent.
    leaveOverride: z.enum(["paid", "unpaid"]).optional(),
  }),
  z.object({ action: z.literal("escalate"), note: z.string().trim().max(1000).optional() }),
  z.object({ action: z.literal("reassign"), ownerId: z.string().min(1), note: z.string().trim().max(500).optional() }),
]);

// PATCH /api/workforce/exceptions/[id] — the Call Queue actions: mark contacted, resolve, escalate,
// reassign (admin/hr only). A coordinator can only act on exceptions of assignments they coordinate.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr", "manager"]);
    const { id } = await params;
    const ex = await db.exceptionCase.findUnique({ where: { id } });
    if (!ex) return apiError("Not found", 404);
    if (ex.assignmentId) await assertAssignmentAccess(session, ex.assignmentId);
    else if (!isFullAccess(session.role)) return apiError("Not found", 404);
    if (ex.status === "resolved" || ex.status === "dismissed") return apiError("This item is already closed.", 409);

    const body = bodySchema.parse(await request.json());
    const now = new Date();
    const history = JSON.parse(ex.history || "[]") as unknown[];
    const entry = (action: string, note?: string) => history.push({ at: now.toISOString(), by: session.userId, action, note: note ?? null });
    let data: Record<string, unknown> = {};

    if (body.action === "contacted") {
      entry(`contacted:${body.outcome}`, body.note);
      const waiting = body.outcome === "no_answer" || body.outcome === "callback_requested";
      data = { callOutcome: body.outcome, callNote: body.note ?? null, calledAt: now, calledBy: session.userId, status: waiting ? "waiting_contractor" : "in_progress" };
    } else if (body.action === "resolve") {
      entry("resolved", body.note);
      data = { status: "resolved", resolution: body.note, resolvedAt: now, resolvedBy: session.userId, ...(body.outcome ? { callOutcome: body.outcome } : {}) };
      if (body.leaveOverride && ex.assignmentId) {
        const day = await db.dailyStatus.findUnique({ where: { assignmentId_date: { assignmentId: ex.assignmentId, date: ex.date } } });
        if (day && !day.locked) {
          await db.dailyStatus.update({ where: { id: day.id }, data: { leaveOverride: body.leaveOverride, coordinatorNote: body.note } });
          await recomputeDay(day.id);
        }
      }
    } else if (body.action === "escalate") {
      entry("escalated", body.note);
      data = { severity: Math.min(5, ex.severity + 1), status: "escalated" };
      await notify({ userId: ex.ownerId ?? session.userId, title: "Escalated", message: ex.title, category: "attendance", link: "workforce" });
    } else if (body.action === "reassign") {
      if (!isFullAccess(session.role)) return apiError("Only admin or HR can reassign.", 403);
      const target = await db.user.findUnique({ where: { id: body.ownerId }, select: { id: true, role: true, active: true } });
      if (!target || !target.active || target.role === "employee") return apiError("Pick an active staff login.", 400);
      entry("reassigned", body.note);
      data = { ownerId: target.id };
      await notify({ userId: target.id, title: "Assigned to you", message: ex.title, category: "attendance", link: "workforce" });
    }

    const updated = await db.exceptionCase.update({ where: { id }, data: { ...data, history: JSON.stringify(history) } });
    await logAudit({ session, action: `exception_${body.action}`, entity: "ExceptionCase", entityId: id, details: body });
    return NextResponse.json({ data: updated });
  } catch (error) {
    return workforceError(error, "update exception");
  }
}
