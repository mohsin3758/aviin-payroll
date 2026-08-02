import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { createRegularizationSchema } from "@/lib/validations/attendance-regularization";
import { istDateOnly } from "@/lib/date-ist";
import { logAudit } from "@/lib/audit";
import { notifyRoles } from "@/lib/notifications";

// GET /api/attendance-regularizations — employees see only their own; admin/hr/manager see everyone's.
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (session.role === "employee") {
      if (!session.employeeId) return apiError("Your login isn't linked to an employee record.", 403);
      where.employeeId = session.employeeId;
    }
    if (status) where.status = status;

    const requests = await db.attendanceRegularizationRequest.findMany({
      where,
      include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: requests });
  } catch (error) {
    return handleApiError(error, "fetch attendance regularization requests");
  }
}

// POST /api/attendance-regularizations — an employee requests a correction to their own
// attendance, or admin/hr/manager records one on behalf of any employee.
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const body = await request.json();
    const parsed = createRegularizationSchema.parse(body);

    let employeeId: string;
    if (session.role === "employee") {
      if (!session.employeeId) return apiError("Your login isn't linked to an employee record.", 403);
      employeeId = session.employeeId;
    } else {
      if (session.role !== "admin" && session.role !== "hr" && session.role !== "manager") {
        return apiError("Forbidden — requires role: admin, hr, or manager.", 403);
      }
      if (!parsed.employeeId) return apiError("employeeId is required", 400);
      employeeId = parsed.employeeId;
    }

    const employee = await db.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return apiError("Employee not found", 404);

    if (parsed.requestedPunchIn && parsed.requestedPunchOut && parsed.requestedPunchOut < parsed.requestedPunchIn) {
      return apiError("requestedPunchOut must be after requestedPunchIn.", 400);
    }

    const regularization = await db.attendanceRegularizationRequest.create({
      data: {
        employeeId,
        date: istDateOnly(parsed.date),
        requestedPunchIn: parsed.requestedPunchIn ?? null,
        requestedPunchOut: parsed.requestedPunchOut ?? null,
        reason: parsed.reason,
      },
      include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
    });

    await logAudit({ session, action: "create", entity: "AttendanceRegularizationRequest", entityId: regularization.id });

    await notifyRoles(["admin", "hr", "manager"], {
      title: "Attendance correction requested",
      message: `${employee.firstName} ${employee.lastName ?? ""} requested a correction for ${istDateOnly(parsed.date).toDateString()}`,
      category: "attendance",
      link: "attendance",
    });

    return NextResponse.json({ data: regularization }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "create attendance regularization request");
  }
}
