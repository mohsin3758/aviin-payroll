import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import { apiError, handleApiError, getDefaultCompanyId } from "@/lib/api-utils";
import { createExitRequestSchema } from "@/lib/validations/exit-request";
import { logAudit } from "@/lib/audit";
import { notifyRoles } from "@/lib/notifications";

// GET /api/exit-requests — employees see only their own; admin/hr/manager see everyone's.
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

    const requests = await db.exitRequest.findMany({
      where,
      include: { employee: { select: { firstName: true, lastName: true, employeeCode: true, designation: true } }, finalSettlement: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: requests });
  } catch (error) {
    return handleApiError(error, "fetch exit requests");
  }
}

// POST /api/exit-requests — an employee resigns on their own behalf, or admin/hr records a
// resignation on behalf of any employee.
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const body = await request.json();
    const parsed = createExitRequestSchema.parse(body);

    let employeeId: string;
    if (session.role === "employee") {
      if (!session.employeeId) return apiError("Your login isn't linked to an employee record.", 403);
      employeeId = session.employeeId;
    } else {
      if (session.role !== "admin" && session.role !== "hr") {
        return apiError("Forbidden — requires role: admin or hr.", 403);
      }
      if (!parsed.employeeId) return apiError("employeeId is required", 400);
      employeeId = parsed.employeeId;
    }

    const employee = await db.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return apiError("Employee not found", 404);
    if (employee.dateOfExit) return apiError("This employee has already exited.", 409);

    const existing = await db.exitRequest.findUnique({ where: { employeeId } });
    if (existing && existing.status !== "rejected" && existing.status !== "withdrawn") {
      return apiError("An exit request is already in progress for this employee.", 409);
    }

    const companyId = await getDefaultCompanyId();
    const company = await db.company.findUnique({ where: { id: companyId } });
    const noticePeriodDays = company?.defaultNoticePeriodDays ?? 30;

    const lastWorkingDate = new Date(parsed.resignationDate);
    lastWorkingDate.setDate(lastWorkingDate.getDate() + noticePeriodDays);

    const exitRequest = await db.exitRequest.create({
      data: {
        employeeId,
        resignationDate: parsed.resignationDate,
        noticePeriodDays,
        lastWorkingDate,
        reason: parsed.reason ?? null,
        status: "pending_manager",
      },
    });

    await logAudit({ session, action: "create", entity: "ExitRequest", entityId: exitRequest.id });

    await notifyRoles(["admin", "hr", "manager"], {
      title: "New resignation submitted",
      message: `${employee.firstName} ${employee.lastName ?? ""} has resigned, pending manager approval`,
      category: "exit",
      link: "exit-management",
    });

    return NextResponse.json({ data: exitRequest }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "create exit request");
  }
}
