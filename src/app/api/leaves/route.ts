import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { z } from "zod";
import { apiError, handleApiError } from "@/lib/api-utils";
import { scopeToOwnEmployeeIfSelf } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

const createLeaveSchema = z.object({
  employeeId: z.string().min(1),
  leaveTypeId: z.string().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  reason: z.string().trim().max(500).nullable().optional(),
});

// GET /api/leaves?types or /api/leaves?employeeId=...&status=...&year=...
export async function GET(request: NextRequest) {
  try {
    // employee role: silently restricted to their own applications (matches ess/leaves)
    // rather than 403ing, since the shared Leave Mgmt page and My Portal both hit this route.
    const { forcedEmployeeId } = await scopeToOwnEmployeeIfSelf(request);
    const { searchParams } = request.nextUrl;

    // If "types" query param is present, return all leave types (reference data, not
    // employee-specific — fine for every authenticated role, including employee).
    if (searchParams.has("types")) {
      const leaveTypes = await db.leaveType.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
      });
      return NextResponse.json(leaveTypes);
    }

    // Otherwise return leave applications with optional filters
    const employeeId = searchParams.get("employeeId");
    const status = searchParams.get("status");
    const yearParam = searchParams.get("year");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50));

    const where: Record<string, unknown> = {};

    if (forcedEmployeeId) {
      where.employeeId = forcedEmployeeId;
    } else if (employeeId) {
      where.employeeId = employeeId;
    }

    if (status) {
      where.status = status;
    }

    if (yearParam) {
      const year = parseInt(yearParam, 10);
      where.startDate = {
        gte: new Date(year, 0, 1),
        lt: new Date(year + 1, 0, 1),
      };
    }

    const [leaveApplications, total] = await Promise.all([
      db.leaveApplication.findMany({
        where,
        include: {
          employee: {
            select: {
              firstName: true,
              lastName: true,
              employeeCode: true,
            },
          },
          leaveType: true,
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.leaveApplication.count({ where }),
    ]);

    return NextResponse.json({
      data: leaveApplications,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    return handleApiError(error, "fetch leave applications");
  }
}

// POST /api/leaves - Create a leave application
export async function POST(request: NextRequest) {
  try {
    const { session, forcedEmployeeId } = await scopeToOwnEmployeeIfSelf(request);
    const body = await request.json();
    const parsed = createLeaveSchema.parse(body);
    // employee role: whatever employeeId they submit is ignored in favor of their own —
    // mirrors ess/leaves' POST behavior exactly. The Leave Mgmt UI that normally calls this
    // route is now admin/hr/manager-only, but this route itself must still refuse to let an
    // employee session log a leave against someone else's record via a direct API call.
    const employeeId = forcedEmployeeId ?? parsed.employeeId;
    const { leaveTypeId, startDate, endDate, reason } = parsed;

    if (endDate.getTime() < startDate.getTime()) {
      return apiError("endDate must be on or after startDate.", 400);
    }

    const employee = await db.employee.findUnique({ where: { id: employeeId } });
    if (!employee) {
      return apiError("Employee not found.", 404);
    }

    const diffMs = endDate.getTime() - startDate.getTime();
    const totalDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1;

    const year = startDate.getFullYear();
    const balance = await db.leaveBalance.findUnique({
      where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } },
    });
    if (!balance) {
      return apiError("No leave balance configured for this employee/leave type/year.", 400);
    }
    const available = balance.totalAllocated + balance.carryForwarded - balance.used;
    if (totalDays > available) {
      return apiError(
        `Insufficient leave balance: requested ${totalDays} day(s), only ${available} available.`,
        400
      );
    }

    const leaveApplication = await db.leaveApplication.create({
      data: {
        employeeId,
        leaveTypeId,
        startDate,
        endDate,
        totalDays,
        reason: reason ?? null,
        status: "pending",
      },
      include: {
        employee: {
          select: {
            firstName: true,
            lastName: true,
            employeeCode: true,
          },
        },
        leaveType: true,
      },
    });

    await logAudit({
      session,
      action: "create",
      entity: "LeaveApplication",
      entityId: leaveApplication.id,
      details: { employeeId, leaveTypeId, totalDays },
    });

    return NextResponse.json(leaveApplication, { status: 201 });
  } catch (error) {
    return handleApiError(error, "create leave application");
  }
}
