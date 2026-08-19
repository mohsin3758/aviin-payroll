import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";
import { requirePayrollFeature, assertEmployeeInScope } from "@/lib/payroll-access";
import { logAudit } from "@/lib/audit";
import { istDateOnly } from "@/lib/date-ist";

const createWfhSchema = z.object({
  employeeId: z.string().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  reason: z.string().trim().max(500).nullable().optional(),
});

// GET /api/wfh?employeeId=&status=&year= — admin/hr/manager view of WFH requests (the standalone
// "WFH Requests" screen). Employees use GET /api/ess/wfh for their own requests instead.
export async function GET(request: NextRequest) {
  try {
    const { restriction } = await requirePayrollFeature(request, ["admin", "hr", "manager"], "manage_wfh");
    const { searchParams } = request.nextUrl;

    const employeeId = searchParams.get("employeeId");
    const status = searchParams.get("status");
    const yearParam = searchParams.get("year");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50));

    const where: Record<string, unknown> = {};

    if (employeeId) {
      assertEmployeeInScope(restriction, employeeId);
      where.employeeId = employeeId;
    } else if (restriction.employeeIds) {
      where.employeeId = { in: [...restriction.employeeIds] };
    }

    if (status) {
      where.status = status;
    }

    if (yearParam) {
      const year = parseInt(yearParam, 10);
      where.startDate = { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) };
    }

    const [requests, total] = await Promise.all([
      db.wfhRequest.findMany({
        where,
        include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.wfhRequest.count({ where }),
    ]);

    return NextResponse.json({
      data: requests,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    return handleApiError(error, "fetch WFH requests");
  }
}

// POST /api/wfh — admin/hr/manager creates a WFH request on an employee's behalf (the "Apply"
// button on the standalone WFH Requests screen). Employees use POST /api/ess/wfh for themselves.
export async function POST(request: NextRequest) {
  try {
    const { session, restriction } = await requirePayrollFeature(request, ["admin", "hr", "manager"], "manage_wfh");
    const body = await request.json();
    const { employeeId, startDate: rawStart, endDate: rawEnd, reason } = createWfhSchema.parse(body);

    assertEmployeeInScope(restriction, employeeId);

    const employee = await db.employee.findUnique({ where: { id: employeeId } });
    if (!employee) {
      return apiError("Employee not found.", 404);
    }

    const startDate = istDateOnly(rawStart);
    const endDate = istDateOnly(rawEnd);

    if (endDate.getTime() < startDate.getTime()) {
      return apiError("endDate must be on or after startDate.", 400);
    }

    const diffMs = endDate.getTime() - startDate.getTime();
    const totalDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1;

    const wfhRequest = await db.wfhRequest.create({
      data: { employeeId, startDate, endDate, totalDays, reason: reason ?? null, status: "pending" },
      include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
    });

    await logAudit({ session, action: "create", entity: "WfhRequest", entityId: wfhRequest.id, details: { employeeId, totalDays } });

    return NextResponse.json({ data: wfhRequest }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "create WFH request");
  }
}
