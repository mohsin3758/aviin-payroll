import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { isFullAccess } from "@/lib/workforce/access";
import { visibleAssignments } from "@/lib/workforce/scope-server";
import { workforceError } from "@/lib/workforce/route-helpers";

type Section = "critical" | "call_now" | "waiting_contractor" | "waiting_client" | "payroll_exceptions" | "contract_expiry" | "other";

function sectionOf(e: { severity: number; needsCall: boolean; status: string }): Section {
  if (e.severity >= 4) return "critical";
  if (e.status === "waiting_contractor") return "waiting_contractor";
  if (e.status === "waiting_client") return "waiting_client";
  if (e.needsCall) return "call_now";
  return "other";
}

// GET /api/workforce/attention — "What needs my attention?": the coordinator's home and call
// queue. admin/hr see everything; a manager sees only exceptions on assignments they coordinate.
export async function GET(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin", "hr", "manager"]);
    const now = Date.now();
    const visible = await visibleAssignments(session, { status: "active" });
    const ids = visible.map((a) => a.id);

    const open = await db.exceptionCase.findMany({
      where: { status: { notIn: ["resolved", "dismissed"] }, ...(isFullAccess(session.role) ? {} : { assignmentId: { in: ids } }) },
      orderBy: [{ severity: "desc" }, { slaDueAt: "asc" }, { createdAt: "asc" }],
      take: 300,
    });

    const byId = new Map(visible.map((a) => [a.id, a]));
    const missing = open.filter((e) => e.assignmentId && !byId.has(e.assignmentId)).map((e) => e.assignmentId!);
    if (missing.length > 0) {
      const extra = await db.assignment.findMany({
        where: { id: { in: missing } },
        include: { project: { include: { client: true } }, employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true, phone: true, employmentType: true } }, clientRep: true },
      });
      for (const a of extra) byId.set(a.id, a as never);
    }

    const lastInbound = await db.workforceMessage.findMany({
      where: { direction: "in", employeeId: { in: [...new Set(open.map((e) => e.employeeId).filter((x): x is string => !!x))] } },
      orderBy: { createdAt: "desc" }, take: 300, select: { employeeId: true, createdAt: true },
    });
    const lastReply = new Map<string, Date>();
    for (const m of lastInbound) if (m.employeeId && !lastReply.has(m.employeeId)) lastReply.set(m.employeeId, m.createdAt);

    const items = open.map((e) => {
      const a = e.assignmentId ? byId.get(e.assignmentId) : undefined;
      return {
        id: e.id, synthetic: false, section: sectionOf(e), type: e.type, severity: e.severity, status: e.status, title: e.title, detail: e.detail,
        needsCall: e.needsCall, callOutcome: e.callOutcome, callNote: e.callNote,
        date: e.date.toISOString().slice(0, 10), createdAt: e.createdAt, slaDueAt: e.slaDueAt,
        overdueMinutes: e.slaDueAt ? Math.max(0, Math.round((now - e.slaDueAt.getTime()) / 60000)) : 0,
        assignmentId: e.assignmentId, ownerId: e.ownerId,
        contractor: a ? `${a.employee.firstName} ${a.employee.lastName ?? ""}`.trim() : null,
        phone: a?.employee.phone ?? null,
        project: a?.project.name ?? null, client: a?.project.client.name ?? null,
        lastResponseAt: e.employeeId ? lastReply.get(e.employeeId) ?? null : null,
      };
    });

    // Derived (not stored) items: assignments about to end, and active assignments missing a pay rate.
    const soon = now + 14 * 86_400_000;
    for (const a of visible) {
      const name = `${a.employee.firstName} ${a.employee.lastName ?? ""}`.trim();
      if (a.endDate && a.endDate.getTime() <= soon) {
        items.push({
          id: `expiry:${a.id}`, synthetic: true, section: "contract_expiry", type: "assignment_expiry", severity: 1, status: "open",
          title: `Assignment ends ${a.endDate.toISOString().slice(0, 10)}`, detail: "Renew or plan a replacement.", needsCall: false, callOutcome: null, callNote: null,
          date: a.endDate.toISOString().slice(0, 10), createdAt: a.updatedAt, slaDueAt: null, overdueMinutes: 0, assignmentId: a.id, ownerId: a.resourceCoordinatorId,
          contractor: name, phone: a.employee.phone ?? null, project: a.project.name, client: a.project.client.name, lastResponseAt: null,
        });
      }
      if (isFullAccess(session.role) && !(a.payRate != null && a.payRate > 0)) {
        items.push({
          id: `payrate:${a.id}`, synthetic: true, section: "payroll_exceptions", type: "missing_pay_rate", severity: 2, status: "open",
          title: "Active assignment has no pay rate", detail: "Payroll pre-fill cannot be calculated until a rate is set.", needsCall: false, callOutcome: null, callNote: null,
          date: new Date().toISOString().slice(0, 10), createdAt: a.updatedAt, slaDueAt: null, overdueMinutes: 0, assignmentId: a.id, ownerId: null,
          contractor: name, phone: null, project: a.project.name, client: a.project.client.name, lastResponseAt: null,
        });
      }
    }

    const sections: Record<Section, number> = { critical: 0, call_now: 0, waiting_contractor: 0, waiting_client: 0, payroll_exceptions: 0, contract_expiry: 0, other: 0 };
    for (const i of items) sections[i.section as Section]++;
    return NextResponse.json({ data: { items, sections } });
  } catch (error) {
    return workforceError(error, "fetch attention queue");
  }
}
