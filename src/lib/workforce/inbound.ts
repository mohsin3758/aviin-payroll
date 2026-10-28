import { db } from "@/lib/db";
import { dateKey, localDay } from "@/lib/workforce/time";
import { verifyButtonPayload } from "@/lib/workforce/tokens";
import {
  loadContext, raiseException, recordCheckIn, recordEod, recordPulseAnswer, WorkforceError, type Actor,
} from "@/lib/workforce/daily";

/**
 * Handling of what contractors send BACK over WhatsApp: button taps, free-text replies and
 * delivery receipts. Every inbound message is recorded under its WhatsApp message id, so Meta
 * delivering the same webhook twice (it retries) can never act twice.
 */
export interface InboundMessage {
  id: string;
  from: string; // digits with country code
  kind: "button" | "text" | "other";
  payload?: string; // signed button payload
  text?: string;
}

export interface StatusUpdate {
  id: string; // provider message id
  status: "sent" | "delivered" | "read" | "failed" | string;
  error?: string;
}

const RANK: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3, replied: 4 };

export async function applyStatus(u: StatusUpdate): Promise<void> {
  const m = await db.workforceMessage.findFirst({ where: { providerMessageId: u.id } });
  if (!m) return;
  if (u.status === "failed") {
    await db.workforceMessage.update({ where: { id: m.id }, data: { status: "failed", failureReason: (u.error ?? "delivery failed").slice(0, 300) } });
    if (m.assignmentId && m.date && !m.contactId) {
      await raiseException({
        dedupeKey: `message_failed:${m.assignmentId}:${dateKey(m.date)}`, type: "message_failed", severity: 3, assignmentId: m.assignmentId, date: m.date,
        needsCall: true, title: "WhatsApp message was not delivered", detail: (u.error ?? "Delivery failed").slice(0, 200), slaMinutes: 60,
      });
    }
    return;
  }
  // Only ever move forward (a late "delivered" must not undo "replied").
  if ((RANK[u.status] ?? -1) > (RANK[m.status] ?? 0)) {
    await db.workforceMessage.update({ where: { id: m.id }, data: { status: u.status } });
  }
}

/** Contractor identified by phone: the last 10 digits, matching how Employee.phone is stored. */
async function findContractorAssignments(from: string) {
  const last10 = from.replace(/\D/g, "").slice(-10);
  if (last10.length < 10) return [];
  const employees = await db.employee.findMany({ where: { phone: { endsWith: last10 } }, select: { id: true } });
  if (employees.length === 0) return [];
  return db.assignment.findMany({
    where: { employeeId: { in: employees.map((e) => e.id) }, status: "active" },
    include: { project: true },
  });
}

const HOURS_RE = /(\d{1,2}(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i;

export async function handleInbound(msg: InboundMessage, now: Date = new Date()): Promise<string> {
  // Idempotency: record first; a repeat of the same WhatsApp message id stops here.
  try {
    await db.workforceMessage.create({
      data: {
        idempotencyKey: `in:${msg.id}`, direction: "in", type: "INBOUND", channel: "whatsapp", status: "replied", correlationId: msg.id,
        providerMessageId: msg.id, payload: JSON.stringify({ kind: msg.kind, text: msg.text?.slice(0, 500), hasPayload: !!msg.payload }), sentAt: now,
      },
    });
  } catch (e) {
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002") return "duplicate";
    throw e;
  }
  const actor: Actor = { session: null, label: "contractor:whatsapp" };

  if (msg.kind === "button" && msg.payload) {
    const p = verifyButtonPayload(msg.payload);
    if (!p) return "bad_payload";
    try {
      switch (p.action) {
        case "checkin": await recordCheckIn({ assignmentId: p.assignmentId, channel: "whatsapp", now, actor }); return "checked_in";
        case "pulse_yes": await recordPulseAnswer({ assignmentId: p.assignmentId, answer: "online", now, actor }); return "pulse_online";
        case "pulse_break": await recordPulseAnswer({ assignmentId: p.assignmentId, answer: "break", now, actor }); return "pulse_break";
        case "pulse_leave":
        case "leave": {
          await recordPulseAnswer({ assignmentId: p.assignmentId, answer: "leave", now, actor }); return "reports_leave";
        }
        case "help": {
          const ctx = await loadContext(p.assignmentId);
          if (ctx) {
            await raiseException({
              dedupeKey: `needs_help:${p.assignmentId}:${p.dateKey}`, type: "needs_help", severity: 3, needsCall: true, assignmentId: p.assignmentId,
              date: localDay(now, ctx.tzOffsetMinutes), title: "Contractor asked for help", detail: "They tapped 'Need help' on a reminder. Call them.", slaMinutes: 30, now,
            });
          }
          return "help_requested";
        }
      }
    } catch (e) {
      if (e instanceof WorkforceError) return `rejected:${e.message}`; // e.g. day already closed: surfaced in the log, never crashes the webhook
      throw e;
    }
    return "ignored";
  }

  if (msg.kind === "text" && msg.text) {
    const assignments = await findContractorAssignments(msg.from);
    if (assignments.length === 0) return "unknown_sender";
    const text = msg.text.trim();

    if (assignments.length === 1) {
      const asg = assignments[0];
      const ctx = await loadContext(asg.id);
      if (ctx) {
        const day = localDay(now, ctx.tzOffsetMinutes);
        const daily = await db.dailyStatus.findUnique({ where: { assignmentId_date: { assignmentId: asg.id, date: day } } });
        const eodPrompted = await db.workforceMessage.count({ where: { assignmentId: asg.id, date: day, type: "END_OF_DAY", direction: "out", status: { in: ["sent", "delivered", "read"] } } });
        if (/^\s*(leave|sick|on leave)\b/i.test(text)) {
          await recordPulseAnswer({ assignmentId: asg.id, answer: "leave", now, actor }).catch(() => undefined);
          return "reports_leave";
        }
        // A free-text reply after the end-of-day prompt IS the end-of-day update.
        if (eodPrompted > 0 && daily && !daily.eodAt && ctx.resolved.settings.eodMode !== "web_link") {
          const hours = HOURS_RE.exec(text);
          await recordEod({ assignmentId: asg.id, mode: "free_text", fields: { raw: text, completed: text, hours: hours ? Number(hours[1]) : null }, now, actor });
          return "eod_free_text";
        }
      }
    }
    // Anything else goes to a coordinator rather than being dropped.
    const asg = assignments[0];
    const ctx = await loadContext(asg.id);
    if (ctx) {
      await raiseException({
        dedupeKey: `inbound_message:${msg.id}`, type: "inbound_message", severity: 1, assignmentId: asg.id, date: localDay(now, ctx.tzOffsetMinutes),
        title: "Contractor sent a message", detail: text.slice(0, 300), slaMinutes: 240, now,
      });
    }
    return "forwarded_to_coordinator";
  }
  return "ignored";
}
