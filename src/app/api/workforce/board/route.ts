import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { visibleAssignments } from "@/lib/workforce/scope-server";
import { boardColumn } from "@/lib/workforce/board";
import { loadContext } from "@/lib/workforce/daily";
import { localDay } from "@/lib/workforce/time";
import { localMinutesOfDay } from "@/lib/workforce/attendance-rules";
import { timeToMinutes } from "@/lib/workforce/settings";
import { parseDay, workforceError } from "@/lib/workforce/route-helpers";

// GET /api/workforce/board?date=YYYY-MM-DD&clientId=&projectId=&coordinatorId= — Today's Workforce
// Board. Scoped exactly like the assignment list (coordinators see only theirs).
export async function GET(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin", "hr", "manager"]);
    const sp = request.nextUrl.searchParams;
    const dateParam = sp.get("date");
    const forced = dateParam ? parseDay(dateParam) : null;
    if (dateParam && !forced) return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });

    const extra: Record<string, unknown> = { status: "active" };
    if (sp.get("projectId")) extra.projectId = sp.get("projectId");
    if (sp.get("clientId")) extra.project = { clientId: sp.get("clientId") };
    if (sp.get("coordinatorId")) extra.resourceCoordinatorId = sp.get("coordinatorId");
    const assignments = await visibleAssignments(session, extra);

    const now = new Date();
    const rows: Record<string, unknown>[] = [];
    for (const a of assignments) {
      const ctx = await loadContext(a.id);
      if (!ctx) continue;
      const day = forced ?? localDay(now, ctx.tzOffsetMinutes);
      const [daily, openExceptions] = await Promise.all([
        db.dailyStatus.findUnique({ where: { assignmentId_date: { assignmentId: a.id, date: day } } }),
        db.exceptionCase.count({ where: { assignmentId: a.id, date: day, status: { notIn: ["resolved", "dismissed"] } } }),
      ]);
      const isToday = day.getTime() === localDay(now, ctx.tzOffsetMinutes).getTime();
      const shiftOver = day < localDay(now, ctx.tzOffsetMinutes) || (isToday && localMinutesOfDay(now, ctx.tzOffsetMinutes) >= timeToMinutes(ctx.resolved.settings.shiftEnd));
      const column = boardColumn({
        state: daily?.state ?? "pending", hasCheckIn: !!daily?.checkInAt, hasCheckOut: !!daily?.checkOutAt, eodDone: !!daily?.eodAt,
        closed: !!daily?.closed, openExceptions, shiftOver,
      });
      rows.push({
        assignmentId: a.id, dailyStatusId: daily?.id ?? null, column,
        contractor: `${a.employee.firstName} ${a.employee.lastName ?? ""}`.trim(), employeeCode: a.employee.employeeCode,
        client: a.project.client.name, project: a.project.name, workMode: a.workMode, location: a.location,
        resourceCoordinatorId: a.resourceCoordinatorId, kamId: a.kamId,
        state: daily?.state ?? "pending", checkInAt: daily?.checkInAt ?? null, checkOutAt: daily?.checkOutAt ?? null, hoursWorked: daily?.hoursWorked ?? null,
        lateMinutes: daily?.lateMinutes ?? 0, eodDone: !!daily?.eodAt, clientConfirm: daily?.clientConfirm ?? "none", openExceptions,
      });
    }
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.column as string] = (counts[r.column as string] ?? 0) + 1;
    return NextResponse.json({ data: { rows, counts, date: (forced ?? localDay(now, 330)).toISOString().slice(0, 10) } });
  } catch (error) {
    return workforceError(error, "fetch workforce board");
  }
}
