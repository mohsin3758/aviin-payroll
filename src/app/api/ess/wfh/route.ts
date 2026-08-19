import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOwnEmployeeId } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { notifyRoles } from "@/lib/notifications";
import { istDateOnly } from "@/lib/date-ist";

const applyWfhSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  reason: z.string().trim().max(500).nullable().optional(),
});

// GET /api/ess/wfh?year=&status= — the current user's own WFH requests.
export async function GET(request: NextRequest) {
  try {
    const { employeeId } = await requireOwnEmployeeId(request);
    const { searchParams } = request.nextUrl;
    const year = searchParams.get("year");
    const status = searchParams.get("status");

    const where: Record<string, unknown> = { employeeId };
    if (year) {
      const y = parseInt(year, 10);
      where.startDate = { gte: new Date(y, 0, 1), lte: new Date(y, 11, 31, 23, 59, 59, 999) };
    }
    if (status) {
      where.status = status;
    }

    const requests = await db.wfhRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: requests });
  } catch (error) {
    return handleApiError(error, "fetch own WFH requests");
  }
}

// POST /api/ess/wfh — the current user requests WFH for a date range on their own behalf.
// Unlike leave, there's no balance to check against — any employee can request any range;
// admin/hr/manager approval is the only gate.
export async function POST(request: NextRequest) {
  try {
    const { session, employeeId } = await requireOwnEmployeeId(request);
    const body = await request.json();
    const { startDate: rawStart, endDate: rawEnd, reason } = applyWfhSchema.parse(body);

    const startDate = istDateOnly(rawStart);
    const endDate = istDateOnly(rawEnd);

    if (endDate.getTime() < startDate.getTime()) {
      return apiError("endDate must be on or after startDate.", 400);
    }

    const diffMs = endDate.getTime() - startDate.getTime();
    const totalDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1;

    const wfhRequest = await db.wfhRequest.create({
      data: { employeeId, startDate, endDate, totalDays, reason: reason ?? null, status: "pending" },
    });

    await logAudit({ session, action: "create", entity: "WfhRequest", entityId: wfhRequest.id, details: { self: true, totalDays } });

    await notifyRoles(["admin", "hr", "manager"], {
      title: "New WFH request",
      message: `${session.name} requested ${totalDays} day(s) of work-from-home`,
      category: "wfh",
      link: "wfh-requests",
    });

    return NextResponse.json({ data: wfhRequest }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "request WFH");
  }
}
