import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { isFullAccess } from "@/lib/workforce/access";
import { visibleAssignments } from "@/lib/workforce/scope-server";
import { workforceError } from "@/lib/workforce/route-helpers";

// GET /api/workforce/disputes?status=open — admin/hr see all; a coordinator sees disputes on their assignments.
export async function GET(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin", "hr", "manager"]);
    const status = request.nextUrl.searchParams.get("status") ?? "open";
    const ids = isFullAccess(session.role) ? null : (await visibleAssignments(session)).map((a) => a.id);
    const disputes = await db.dispute.findMany({
      where: { status, ...(ids ? { dailyStatus: { assignmentId: { in: ids } } } : {}) },
      orderBy: { createdAt: "desc" }, take: 200,
      include: { dailyStatus: { include: { assignment: { include: { project: { include: { client: true } }, employee: { select: { firstName: true, lastName: true } } } } } } },
    });
    return NextResponse.json({
      data: disputes.map((d) => ({
        id: d.id, status: d.status, raisedBy: d.raisedBy, reason: d.reason, comment: d.comment, createdAt: d.createdAt, resolution: d.resolution,
        dailyStatusId: d.dailyStatusId, date: d.dailyStatus.date.toISOString().slice(0, 10), state: d.dailyStatus.state,
        contractor: `${d.dailyStatus.assignment.employee.firstName} ${d.dailyStatus.assignment.employee.lastName ?? ""}`.trim(),
        project: d.dailyStatus.assignment.project.name, client: d.dailyStatus.assignment.project.client.name,
      })),
    });
  } catch (error) {
    return workforceError(error, "fetch disputes");
  }
}
