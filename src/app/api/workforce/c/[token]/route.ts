import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { resolveActionToken } from "@/lib/workforce/tokens";
import { raiseException, recomputeDay } from "@/lib/workforce/daily";
import { logAudit } from "@/lib/audit";
import { addDays } from "@/lib/workforce/time";
import { parseDay, workforceError } from "@/lib/workforce/route-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { apiError } from "@/lib/api-utils";
import type { DayResult } from "@/lib/workforce/attendance-rules";

// Public (no session): the signed link a client representative receives in the daily digest. The
// token ties the request to ONE contact and ONE project, and a representative can only ever see
// and act on the assignments where they are the named client contact. No pay figures, phone
// numbers or internal exception details are exposed here.

const STATE_LABEL: Record<string, string> = {
  pending: "Not started", present: "Present", late: "Present (late)", half_day: "Half day", absent: "Absent", leave: "On leave", holiday: "Holiday", weekly_off: "Weekly off",
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const t = await resolveActionToken(token, "client");
    if (!t.contactId || !t.projectId || !t.date) return apiError("This link is invalid or has expired.", 404);

    // The link opens on its own date; the representative may look back up to 7 days.
    const requested = parseDay(request.nextUrl.searchParams.get("date"));
    const day = requested && requested <= t.date && requested >= addDays(t.date, -7) ? requested : t.date;

    const [contact, project, assignments] = await Promise.all([
      db.clientContact.findUnique({ where: { id: t.contactId } }),
      db.project.findUnique({ where: { id: t.projectId }, include: { client: true } }),
      db.assignment.findMany({
        where: { projectId: t.projectId, clientRepContactId: t.contactId, status: { in: ["active", "ended"] }, startDate: { lte: day }, OR: [{ endDate: null }, { endDate: { gte: day } }] },
        include: { employee: { select: { firstName: true, lastName: true } } },
      }),
    ]);
    if (!contact || !project) return apiError("This link is invalid or has expired.", 404);

    const rows: Record<string, unknown>[] = [];
    for (const a of assignments) {
      const d = await db.dailyStatus.findUnique({ where: { assignmentId_date: { assignmentId: a.id, date: day } } });
      const ev = d?.evaluation ? (JSON.parse(d.evaluation) as DayResult) : null;
      rows.push({
        assignmentId: a.id, contractor: `${a.employee.firstName} ${a.employee.lastName ?? ""}`.trim(),
        state: d?.state ?? "pending", stateLabel: STATE_LABEL[d?.state ?? "pending"] ?? d?.state,
        checkInAt: d?.checkInAt ?? null, checkOutAt: d?.checkOutAt ?? null, hoursWorked: d?.hoursWorked ?? null,
        overtimeHours: ev?.overtimeHours ?? 0, approvedOvertimeHours: d?.approvedOvertimeHours ?? 0,
        completed: d?.eodCompleted ?? null, inProgress: d?.eodInProgress ?? null, blockers: d?.eodBlockers ?? null,
        clientConfirm: d?.clientConfirm ?? "none", locked: !!d?.locked,
      });
    }

    const [firstOfMonth, firstOfNext] = [new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1)), new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 1))];
    void firstOfMonth; void firstOfNext;
    const prev = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() - 1, 1));
    const signOffs = await db.clientSignOff.findMany({
      where: { projectId: t.projectId, OR: [{ year: day.getUTCFullYear(), month: day.getUTCMonth() + 1 }, { year: prev.getUTCFullYear(), month: prev.getUTCMonth() + 1 }] },
    });
    return NextResponse.json({
      data: {
        contact: contact.name, project: project.name, client: project.client.name, date: day.toISOString().slice(0, 10), rows,
        signOffs: signOffs.map((s) => ({ year: s.year, month: s.month, status: s.status })),
      },
    });
  } catch (error) {
    return workforceError(error, "open client link");
  }
}

const postSchema = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("feedback"), assignmentId: z.string().min(1), date: z.string().optional(),
    onTrack: z.boolean().optional(), rating: z.number().int().min(1).max(5).optional(), comment: z.string().trim().max(500).optional(),
  }).refine((v) => v.onTrack !== undefined || v.rating !== undefined, { message: "Say whether they are on track and/or give a rating." }),
  z.object({
    decision: z.literal("confirm"), assignmentId: z.string().min(1), date: z.string().optional(),
    approvedOvertimeHours: z.number().min(0).max(24).optional(),
  }),
  z.object({
    decision: z.literal("dispute"), assignmentId: z.string().min(1), date: z.string().optional(),
    reason: z.string().trim().min(3, "Give a reason").max(300), comment: z.string().trim().max(1000).optional(),
    claimedState: z.string().trim().max(40).optional(), claimedHours: z.number().min(0).max(24).optional(),
  }),
]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`wf-client:${ip}`, 60, 60_000).allowed) return apiError("Too many requests. Slow down.", 429);
    const { token } = await params;
    const t = await resolveActionToken(token, "client");
    if (!t.contactId || !t.projectId || !t.date) return apiError("This link is invalid or has expired.", 404);
    const body = postSchema.parse(await request.json());

    const day = (body.date ? parseDay(body.date) : null) ?? t.date;
    if (day > t.date || day < addDays(t.date, -7)) return apiError("That date is outside this link.", 400);

    // Only the named client contact on that assignment may act on it.
    const a = await db.assignment.findUnique({ where: { id: body.assignmentId }, include: { employee: { select: { firstName: true } } } });
    if (!a || a.projectId !== t.projectId || a.clientRepContactId !== t.contactId) return apiError("Not found", 404);
    if (body.decision === "feedback") {
      // Weekly view of the contractor (feeds the reliability score's Delivery and Feedback parts).
      const weekOf = addDays(day, -((day.getUTCDay() + 6) % 7));
      await db.clientFeedback.upsert({
        where: { assignmentId_contactId_weekOf: { assignmentId: a.id, contactId: t.contactId, weekOf } },
        create: { assignmentId: a.id, contactId: t.contactId, onTrack: body.onTrack ?? null, rating: body.rating ?? null, comment: body.comment ?? null, weekOf },
        update: { onTrack: body.onTrack ?? null, rating: body.rating ?? null, comment: body.comment ?? null },
      });
      await logAudit({ session: null, action: "client_feedback", entity: "ClientFeedback", entityId: a.id, details: { by: `client:${t.contactId}`, onTrack: body.onTrack, rating: body.rating } });
      return NextResponse.json({ data: { ok: true } });
    }
    const d = await db.dailyStatus.findUnique({ where: { assignmentId_date: { assignmentId: a.id, date: day } } });
    if (!d) return apiError("There is no record for that day yet.", 404);
    if (d.locked) return apiError("This day is already locked into a closed month.", 409);

    const label = `client:${t.contactId}`;
    if (body.decision === "confirm") {
      let approved = d.approvedOvertimeHours;
      if (body.approvedOvertimeHours !== undefined) {
        const ev = d.evaluation ? (JSON.parse(d.evaluation) as DayResult) : null;
        approved = Math.min(body.approvedOvertimeHours, ev?.overtimeHours ?? body.approvedOvertimeHours);
      }
      await db.dailyStatus.update({ where: { id: d.id }, data: { clientConfirm: "confirmed", clientConfirmAt: new Date(), clientConfirmNote: null, approvedOvertimeHours: approved } });
      await recomputeDay(d.id);
      await logAudit({ session: null, action: "client_confirm", entity: "DailyStatus", entityId: d.id, details: { by: label, approvedOvertimeHours: approved } });
      return NextResponse.json({ data: { ok: true } });
    }

    const comment = [body.claimedState ? `Client says: ${body.claimedState}` : null, body.claimedHours !== undefined ? `${body.claimedHours} h` : null, body.comment].filter(Boolean).join(" · ");
    const dispute = await db.dispute.create({ data: { dailyStatusId: d.id, raisedBy: "client", reason: body.reason, comment: comment || null } });
    await db.dailyStatus.update({ where: { id: d.id }, data: { clientConfirm: "disputed", clientConfirmAt: new Date(), clientConfirmNote: body.reason } });
    await raiseException({
      dedupeKey: `client_dispute:${dispute.id}`, type: "client_dispute", severity: 3, assignmentId: a.id, date: day, needsCall: false,
      ownerId: a.clientCoordinatorId ?? a.resourceCoordinatorId ?? a.kamId, title: `Client disputed ${a.employee.firstName}'s day`, detail: `${body.reason}${comment ? ` (${comment})` : ""}`.slice(0, 400), slaMinutes: 24 * 60,
    });
    await logAudit({ session: null, action: "client_dispute", entity: "Dispute", entityId: dispute.id, details: { by: label, reason: body.reason } });
    return NextResponse.json({ data: { ok: true, disputeId: dispute.id } }, { status: 201 });
  } catch (error) {
    return workforceError(error, "client action");
  }
}
