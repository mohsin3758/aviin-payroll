import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOwnEmployeeId } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { notifyRoles } from "@/lib/notifications";

const applyLeaveSchema = z.object({
  leaveTypeId: z.string().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  reason: z.string().trim().max(500).nullable().optional(),
});

// GET /api/ess/leaves?year= — the current user's own leave applications.
export async function GET(request: NextRequest) {
  try {
    const { employeeId } = await requireOwnEmployeeId(request);
    const { searchParams } = request.nextUrl;
    const year = searchParams.get("year");

    const where: Record<string, unknown> = { employeeId };
    if (year) {
      const y = parseInt(year, 10);
      where.startDate = { gte: new Date(y, 0, 1), lte: new Date(y, 11, 31, 23, 59, 59, 999) };
    }

    const applications = await db.leaveApplication.findMany({
      where,
      include: { leaveType: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: applications });
  } catch (error) {
    return handleApiError(error, "fetch own leave applications");
  }
}

// POST /api/ess/leaves — the current user applies for leave on their own behalf.
export async function POST(request: NextRequest) {
  try {
    const { session, employeeId } = await requireOwnEmployeeId(request);
    const body = await request.json();
    const { leaveTypeId, startDate, endDate, reason } = applyLeaveSchema.parse(body);

    if (endDate.getTime() < startDate.getTime()) {
      return apiError("endDate must be on or after startDate.", 400);
    }

    const diffMs = endDate.getTime() - startDate.getTime();
    const totalDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1;

    const year = startDate.getFullYear();
    const balance = await db.leaveBalance.findUnique({
      where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } },
    });
    if (!balance) {
      return apiError("No leave balance configured for this leave type/year.", 400);
    }
    const available = balance.totalAllocated + balance.carryForwarded - balance.used;
    if (totalDays > available) {
      return apiError(`Insufficient leave balance: requested ${totalDays} day(s), only ${available} available.`, 400);
    }

    const leaveApplication = await db.leaveApplication.create({
      data: { employeeId, leaveTypeId, startDate, endDate, totalDays, reason: reason ?? null, status: "pending" },
      include: { leaveType: true },
    });

    await logAudit({ session, action: "create", entity: "LeaveApplication", entityId: leaveApplication.id, details: { self: true, leaveTypeId, totalDays } });

    await notifyRoles(["admin", "hr", "manager"], {
      title: "New leave application",
      message: `${session.name} applied for ${totalDays} day(s) of leave`,
      category: "leave",
      link: "leaves",
    });

    return NextResponse.json({ data: leaveApplication }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "apply for leave");
  }
}
