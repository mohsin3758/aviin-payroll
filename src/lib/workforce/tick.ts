import { db } from "@/lib/db";
import { notify, notifyRoles } from "@/lib/notifications";
import { getEffectiveWhatsappConfig, sendWhatsappTemplateGeneric, type EffectiveWhatsappConfig } from "@/lib/whatsapp";
import { sendEmail, getEffectiveSmtpConfig } from "@/lib/mailer";
import { resolveFlag, type FlagRow, type WorkforceFlagKey } from "@/lib/workforce/flags";
import { MESSAGE_CAP_CEILING, timeToMinutes } from "@/lib/workforce/settings";
import { messageAllowed, planActions, type PlannedAction, type MessageType, type PulseFact } from "@/lib/workforce/planner";
import { localMinutesOfDay } from "@/lib/workforce/attendance-rules";
import { dateKey, localDay, addDays } from "@/lib/workforce/time";
import { buildTemplate, dateLabelOf, fmt12, publicBaseUrl } from "@/lib/workforce/templates";
import { createActionToken } from "@/lib/workforce/tokens";
import {
  dayFacts, ensureDailyStatus, loadContext, raiseException, recomputeDay, type AssignmentContext,
} from "@/lib/workforce/daily";

/**
 * One pass of the automation (runs every minute in the in-process worker, instrumentation.ts).
 * Everything is derived from the database and guarded by idempotency keys, so a restart, a
 * slow tick, or two ticks overlapping can never double-send or double-raise anything.
 */
export interface TickResult {
  assignments: number;
  messages: number;
  suppressed: number;
  exceptions: number;
  daysClosed: number;
  digests: number;
  retried: number;
  errors: string[];
}

const CONTRACTOR_TYPES: MessageType[] = ["CHECK_IN", "LATE_REMINDER", "FINAL_REMINDER", "STILL_ONLINE", "END_OF_DAY", "EOD_REMINDER"];

type Flags = FlagRow[];
const on = (flags: Flags, key: WorkforceFlagKey, ctx: { clientId: string; projectId: string }) => resolveFlag(flags, key, ctx);

function ownerIdFor(ctx: AssignmentContext, owner: "resource_coordinator" | "client_coordinator" | "kam"): string | null {
  const a = ctx.assignment;
  const order =
    owner === "resource_coordinator" ? [a.resourceCoordinatorId, a.kamId, a.clientCoordinatorId]
    : owner === "client_coordinator" ? [a.clientCoordinatorId, a.kamId, a.resourceCoordinatorId]
    : [a.kamId, a.resourceCoordinatorId, a.clientCoordinatorId];
  return order.find((x): x is string => !!x) ?? null;
}

async function notifyOwner(ownerId: string | null, title: string, message: string) {
  if (ownerId) await notify({ userId: ownerId, title, message, category: "attendance", link: "workforce" });
  else await notifyRoles(["admin", "hr"], { title, message: `${message} (no coordinator is assigned)`, category: "attendance", link: "workforce" });
}

async function executeException(ctx: AssignmentContext, a: Extract<PlannedAction, { kind: "exception" }>, day: Date, now: Date, result: TickResult) {
  const ownerId = ownerIdFor(ctx, a.owner);
  const { created, exception } = await raiseException({
    dedupeKey: a.dedupeKey, type: a.type, severity: a.severity, assignmentId: ctx.assignment.id, title: a.title,
    detail: a.detail, date: day, needsCall: a.needsCall, ownerId, slaMinutes: a.slaMinutes, now,
  });
  if (created) {
    result.exceptions++;
    const name = `${ctx.assignment.employee.firstName} ${ctx.assignment.employee.lastName ?? ""}`.trim();
    await notifyOwner(exception.ownerId, a.title, `${name} · ${ctx.assignment.project.name}. ${a.detail}`);
  }
}

interface DeliverArgs {
  ctx: AssignmentContext;
  a: Extract<PlannedAction, { kind: "message" }>;
  day: Date;
  now: Date;
  flags: Flags;
  waConfig: EffectiveWhatsappConfig | null;
  result: TickResult;
}

async function deliver({ ctx, a, day, now, flags, waConfig, result }: DeliverArgs) {
  const asg = ctx.assignment;
  const flagCtx = { clientId: asg.project.clientId, projectId: asg.projectId };
  const idempotencyKey = a.audience === "client" ? `${a.idempotencyKey}:${asg.clientRepContactId}` : a.idempotencyKey;
  if (await db.workforceMessage.findUnique({ where: { idempotencyKey }, select: { id: true } })) return; // already handled

  const recipient =
    a.audience === "contractor"
      ? { name: asg.employee.firstName, phone: asg.employee.phone }
      : { name: asg.clientRep?.name ?? "there", phone: asg.clientRep?.phone ?? null };
  const dk = dateKey(day);
  const record = async (status: string, extra: Record<string, unknown> = {}) => {
    try {
      return await db.workforceMessage.create({
        data: {
          idempotencyKey, assignmentId: asg.id, employeeId: asg.employeeId, contactId: a.audience === "client" ? asg.clientRepContactId : null,
          direction: "out", type: a.messageType, channel: "whatsapp", priority: a.priority, date: day, scheduledAt: now,
          status, correlationId: `${asg.id}:${dk}:${a.messageType}:${a.seq}`, ...extra,
        },
      });
    } catch (e) {
      // A concurrent tick inserted the same key first: that one owns the message.
      if (typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002") return null;
      throw e;
    }
  };

  // Contractor-directed messages obey quiet hours and the daily cap.
  if (a.audience === "contractor") {
    const sentToday = await db.workforceMessage.count({
      where: { employeeId: asg.employeeId, date: day, direction: "out", type: { in: CONTRACTOR_TYPES }, status: { in: ["queued", "sent", "delivered", "read", "replied"] } },
    });
    const gate = messageAllowed({
      now, tzOffsetMinutes: ctx.tzOffsetMinutes, settings: ctx.resolved.settings, sentToday, priority: a.priority, hardCeiling: MESSAGE_CAP_CEILING,
    });
    if (!gate.ok) {
      await record("suppressed", { suppressReason: gate.reason });
      result.suppressed++;
      return;
    }
  }

  const waOn = on(flags, "whatsapp_enabled", flagCtx) && !!waConfig;
  if (!waOn) {
    await record("suppressed", { suppressReason: "whatsapp_not_enabled" });
    result.suppressed++;
    return;
  }
  if (!recipient.phone) {
    await record("failed", { failureReason: "no_phone_number" });
    result.suppressed++;
    if (a.audience === "contractor") {
      await raiseException({
        dedupeKey: `message_failed:${asg.id}:${dk}`, type: "message_failed", severity: 3, assignmentId: asg.id, date: day, needsCall: true,
        ownerId: ownerIdFor(ctx, "resource_coordinator"), title: "Cannot message contractor: no phone number on file",
        detail: "Automated messages cannot reach this contractor. Call them and fix their phone number.", slaMinutes: 60, now,
      });
    }
    return;
  }

  const needsToken = a.messageType === "END_OF_DAY" || a.messageType === "EOD_REMINDER";
  const urlToken = needsToken ? await createActionToken({ purpose: "contractor", assignmentId: asg.id, date: day, ttlHours: 36, now }) : undefined;
  const built = buildTemplate({
    type: a.messageType, seq: a.seq, assignmentId: asg.id, dateKey: dk, recipientName: recipient.name,
    contractorName: `${asg.employee.firstName} ${asg.employee.lastName ?? ""}`.trim(), projectName: asg.project.name,
    shiftStartLabel: fmt12(ctx.resolved.settings.shiftStart), dateLabel: dateLabelOf(day), urlToken,
  });

  const row = await record("queued", { template: built.templateName, payload: JSON.stringify({ params: built.bodyParams }) });
  if (!row) return;
  try {
    const sent = await sendWhatsappTemplateGeneric(waConfig!, {
      to: recipient.phone, templateName: built.templateName, language: waConfig!.templateLanguage,
      bodyParams: built.bodyParams, quickReplyPayloads: built.quickReplyPayloads, urlSuffix: built.urlSuffix,
    });
    await db.workforceMessage.update({ where: { id: row.id }, data: { status: "sent", sentAt: now, providerMessageId: sent.messageId } });
    if (a.messageType === "STILL_ONLINE") {
      await db.dailyStatus.update({ where: { assignmentId_date: { assignmentId: asg.id, date: day } }, data: { pulsesSent: { increment: 1 } } });
    }
    result.messages++;
  } catch (e) {
    const reason = e instanceof Error ? e.message : "send failed";
    await db.workforceMessage.update({ where: { id: row.id }, data: { status: "failed", failureReason: reason.slice(0, 300), retryCount: 1 } });
    // A failed send must never look like a silent contractor.
    if (a.audience === "contractor") {
      await raiseException({
        dedupeKey: `message_failed:${asg.id}:${dk}`, type: "message_failed", severity: 2, assignmentId: asg.id, date: day, needsCall: false,
        ownerId: ownerIdFor(ctx, "resource_coordinator"), title: "WhatsApp message could not be delivered",
        detail: reason.slice(0, 200), slaMinutes: 120, now,
      });
    }
  }
}

async function retryFailed(now: Date, flags: Flags, waConfig: EffectiveWhatsappConfig | null, result: TickResult) {
  if (!waConfig) return;
  const failed = await db.workforceMessage.findMany({
    where: { status: "failed", retryCount: { lt: 3 }, direction: "out", failureReason: { not: "no_phone_number" }, createdAt: { gt: new Date(now.getTime() - 60 * 60_000) } },
    take: 50,
  });
  for (const m of failed) {
    // Backoff: wait 2 minutes per attempt made so far.
    if (now.getTime() - m.createdAt.getTime() < m.retryCount * 2 * 60_000) continue;
    try {
      const asg = m.assignmentId ? await db.assignment.findUnique({ where: { id: m.assignmentId }, include: { project: true, employee: true, clientRep: true } }) : null;
      if (!asg || !m.template) continue;
      if (!on(flags, "whatsapp_enabled", { clientId: asg.project.clientId, projectId: asg.projectId })) continue;
      const params = (JSON.parse(m.payload || "{}").params ?? []) as string[];
      const phone = m.contactId ? asg.clientRep?.phone : asg.employee.phone;
      if (!phone) continue;
      const sent = await sendWhatsappTemplateGeneric(waConfig, { to: phone, templateName: m.template, language: waConfig.templateLanguage, bodyParams: params });
      await db.workforceMessage.update({ where: { id: m.id }, data: { status: "sent", sentAt: now, providerMessageId: sent.messageId, failureReason: null, retryCount: { increment: 1 } } });
      result.retried++;
    } catch (e) {
      await db.workforceMessage.update({ where: { id: m.id }, data: { retryCount: { increment: 1 }, failureReason: (e instanceof Error ? e.message : "retry failed").slice(0, 300) } });
    }
  }
}

/** Raises severity of overdue exceptions: an unattended call task reaches management. */
async function escalateOverdue(now: Date) {
  const overdue = await db.exceptionCase.findMany({
    where: { status: { in: ["open", "in_progress", "waiting_contractor", "waiting_client"] }, slaDueAt: { lt: now }, severity: { lt: 4 } },
    take: 100,
  });
  for (const ex of overdue) {
    const history = JSON.parse(ex.history || "[]");
    history.push({ at: now.toISOString(), by: "system", action: "escalated", note: "SLA passed without resolution." });
    await db.exceptionCase.update({ where: { id: ex.id }, data: { severity: 4, status: "escalated", history: JSON.stringify(history) } });
    await notifyRoles(["admin", "hr"], { title: "Escalation: SLA missed", message: ex.title, category: "attendance", link: "workforce" });
  }
}

/** Closes finished days (a pending day with no check-in becomes absent) unless a call task is still open for it. */
async function closeFinishedDays(now: Date, flags: Flags, result: TickResult) {
  const open = await db.dailyStatus.findMany({
    where: { closed: false, locked: false, date: { lt: addDays(localDay(now, 0), 1) } },
    take: 500,
  });
  const ctxCache = new Map<string, AssignmentContext | null>();
  for (const d of open) {
    try {
      if (!ctxCache.has(d.assignmentId)) ctxCache.set(d.assignmentId, await loadContext(d.assignmentId));
      const ctx = ctxCache.get(d.assignmentId);
      if (!ctx) continue;
      if (!on(flags, "contractor_workforce_enabled", { clientId: ctx.assignment.project.clientId, projectId: ctx.assignment.projectId })) continue;

      const today = localDay(now, ctx.tzOffsetMinutes);
      const nowMin = localMinutesOfDay(now, ctx.tzOffsetMinutes);
      const dayEnded = d.date < today;
      const yesterday = addDays(today, -1);
      const atCloseTime = d.date.getTime() === yesterday.getTime() ? nowMin >= timeToMinutes(ctx.resolved.settings.dayCloseTime) : true;
      if (!dayEnded || !atCloseTime) continue;

      const blocking = await db.exceptionCase.count({
        where: { assignmentId: d.assignmentId, date: d.date, needsCall: true, status: { in: ["open", "in_progress", "escalated", "waiting_contractor", "waiting_client"] } },
      });
      if (blocking > 0) continue; // a coordinator is still working it

      const { result: r } = await recomputeDay(d.id, { close: true, now });
      result.daysClosed++;
      if (r?.state === "absent") {
        await raiseException({
          dedupeKey: `day_absent:${d.assignmentId}:${dateKey(d.date)}`, type: "day_absent", severity: 2, assignmentId: d.assignmentId, date: d.date,
          title: "Day closed as absent", detail: r.reasons.join(" "), ownerId: ownerIdFor(ctx, "resource_coordinator"), slaMinutes: 24 * 60, now,
        });
      }
      if (r?.flags.includes("missing_checkout")) {
        await raiseException({
          dedupeKey: `missing_hours:${d.assignmentId}:${dateKey(d.date)}`, type: "missing_hours", severity: 1, assignmentId: d.assignmentId, date: d.date,
          title: "Hours missing on a closed day", detail: "Checked in but no check-out or hours were recorded.", ownerId: ownerIdFor(ctx, "resource_coordinator"), slaMinutes: 48 * 60, now,
        });
      }
    } catch (e) {
      result.errors.push(`close ${d.id}: ${e instanceof Error ? e.message : e}`);
    }
  }
}

/** One daily digest per client representative per project, with a one-tap confirmation link. */
async function sendClientDigests(now: Date, flags: Flags, waConfig: EffectiveWhatsappConfig | null, assignments: Awaited<ReturnType<typeof loadActive>>, result: TickResult) {
  const groups = new Map<string, typeof assignments>();
  for (const a of assignments) {
    if (!a.clientRepContactId) continue;
    const key = `${a.projectId}:${a.clientRepContactId}`;
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  const smtpReady = !!(await getEffectiveSmtpConfig());
  for (const [, list] of groups) {
    const first = list[0];
    const flagCtx = { clientId: first.project.clientId, projectId: first.projectId };
    if (!on(flags, "client_digest_enabled", flagCtx)) continue;
    const ctx = await loadContext(first.id);
    if (!ctx) continue;
    const settings = ctx.resolved.settings;
    if (localMinutesOfDay(now, ctx.tzOffsetMinutes) < timeToMinutes(settings.clientDigestTime)) continue;
    const day = localDay(now, ctx.tzOffsetMinutes);
    const idempotencyKey = `digest:${first.clientRepContactId}:${first.projectId}:${dateKey(day)}`;
    if (await db.workforceMessage.findUnique({ where: { idempotencyKey }, select: { id: true } })) continue;

    const contact = first.clientRep!;
    const token = await createActionToken({ purpose: "client", contactId: contact.id, projectId: first.projectId, date: day, ttlHours: 72, now });
    const built = buildTemplate({
      type: "CLIENT_DIGEST", seq: 0, assignmentId: first.id, dateKey: dateKey(day), recipientName: contact.name, contractorName: "",
      projectName: first.project.name, shiftStartLabel: fmt12(settings.shiftStart), dateLabel: dateLabelOf(day), urlToken: token,
    });
    const base = { idempotencyKey, assignmentId: first.id, contactId: contact.id, direction: "out", type: "CLIENT_DIGEST", priority: 1, date: day, scheduledAt: now, correlationId: idempotencyKey, template: built.templateName };
    try {
      if (on(flags, "whatsapp_enabled", flagCtx) && waConfig && contact.phone) {
        const sent = await sendWhatsappTemplateGeneric(waConfig, { to: contact.phone, templateName: built.templateName, language: waConfig.templateLanguage, bodyParams: built.bodyParams, urlSuffix: built.urlSuffix });
        await db.workforceMessage.create({ data: { ...base, channel: "whatsapp", status: "sent", sentAt: now, providerMessageId: sent.messageId } });
        result.digests++;
      } else if (smtpReady && contact.email) {
        await sendEmail({ to: contact.email, subject: `Workforce summary: ${first.project.name}, ${dateLabelOf(day)}`, html: `<p>${built.plainText}</p><p><a href="${publicBaseUrl()}/c/${token}">Review and confirm</a></p>` });
        await db.workforceMessage.create({ data: { ...base, channel: "email", status: "sent", sentAt: now } });
        result.digests++;
      } else {
        await db.workforceMessage.create({ data: { ...base, channel: "whatsapp", status: "suppressed", suppressReason: "no_channel_available" } });
        result.suppressed++;
      }
    } catch (e) {
      await db.workforceMessage.create({ data: { ...base, channel: "whatsapp", status: "failed", failureReason: (e instanceof Error ? e.message : "send failed").slice(0, 300), retryCount: 1 } }).catch(() => undefined);
      result.errors.push(`digest ${idempotencyKey}: ${e instanceof Error ? e.message : e}`);
    }
  }
}

async function loadActive() {
  return db.assignment.findMany({
    where: { status: "active" },
    include: { project: { include: { client: true } }, employee: { select: { id: true, phone: true, firstName: true, lastName: true, employeeCode: true } }, clientRep: true },
  });
}

export async function runTick(now: Date = new Date()): Promise<TickResult> {
  const started = Date.now();
  const result: TickResult = { assignments: 0, messages: 0, suppressed: 0, exceptions: 0, daysClosed: 0, digests: 0, retried: 0, errors: [] };
  const flags: Flags = await db.featureFlag.findMany({ select: { key: true, scopeKey: true, enabled: true } });

  try {
    // With the master switch off everywhere there is nothing to do: skip all further work.
    if (flags.some((f) => f.key === "contractor_workforce_enabled" && f.enabled)) {
      const waConfig = await getEffectiveWhatsappConfig();
      const assignments = (await loadActive()).filter((a) => on(flags, "contractor_workforce_enabled", { clientId: a.project.clientId, projectId: a.projectId }));
      result.assignments = assignments.length;

      for (const asg of assignments) {
        try {
          const ctx = await loadContext(asg.id);
          if (!ctx) continue;
          const day = localDay(now, ctx.tzOffsetMinutes);
          const facts = await dayFacts(ctx, day);
          if (!facts.assignmentLive) continue;
          const daily = await ensureDailyStatus(asg.id, day);
          const override = daily.leaveOverride as "paid" | "unpaid" | null;
          const isWorkingDay = !facts.isHoliday && !facts.isWeeklyOff && (override ?? facts.leave) === "none";

          const pulseRows = await db.workforceMessage.findMany({
            where: { assignmentId: asg.id, date: day, type: "STILL_ONLINE", direction: "out", status: { in: ["sent", "delivered", "read", "replied"] } },
            orderBy: { createdAt: "asc" },
          });
          const pulses: PulseFact[] = pulseRows.map((m, i) => ({ seq: i + 1, sentAt: m.sentAt ?? m.createdAt, answered: m.status === "replied" }));

          const flagCtx = { clientId: asg.project.clientId, projectId: asg.projectId };
          const actions = planActions({
            now, tzOffsetMinutes: ctx.tzOffsetMinutes, dateKey: dateKey(day), assignmentId: asg.id, settings: ctx.resolved.settings,
            isWorkingDay, checkedIn: !!daily.checkInAt, checkedOut: !!daily.checkOutAt, eodDone: !!daily.eodAt, pulses,
            clientNoticesEnabled: on(flags, "client_digest_enabled", flagCtx), hasClientRep: !!asg.clientRepContactId,
          });

          for (const a of actions) {
            if (a.kind === "exception") await executeException(ctx, a, day, now, result);
            else await deliver({ ctx, a, day, now, flags, waConfig, result });
          }
          await recomputeDay(daily.id, { now });
        } catch (e) {
          result.errors.push(`assignment ${asg.id}: ${e instanceof Error ? e.message : e}`);
        }
      }

      await sendClientDigests(now, flags, waConfig, assignments, result);
      await retryFailed(now, flags, waConfig, result);
      await escalateOverdue(now);
      await closeFinishedDays(now, flags, result);
    }
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e));
  }

  const ms = Date.now() - started;
  await db.workerHeartbeat.upsert({
    where: { id: "worker" },
    create: { id: "worker", lastTickAt: now, lastTickMs: ms, lastError: result.errors[0]?.slice(0, 300) ?? null, tickCount: 1 },
    update: { lastTickAt: now, lastTickMs: ms, lastError: result.errors[0]?.slice(0, 300) ?? null, tickCount: { increment: 1 } },
  });
  return result;
}
