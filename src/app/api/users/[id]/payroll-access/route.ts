import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { payrollAccessSchema } from "@/lib/validations/user";
import { apiError, handleApiError } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// GET/PUT /api/users/[id]/payroll-access — admin only. Reads/replaces the target user's payroll
// feature + employee-scope restrictions (see src/lib/payroll-access.ts for the enforcement side
// and the empty-array-means-unrestricted convention). Only ever meaningful for role "hr" — every
// other role either already has zero payroll access (manager/employee) or must stay the
// always-unrestricted recovery role (admin), so both verbs reject any other target role.

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(request, ["admin"]);
    const { id } = await params;

    const user = await db.user.findUnique({ where: { id } });
    if (!user) {
      return apiError("User not found", 404);
    }

    const [featureRows, employeeRows] = await Promise.all([
      db.userPayrollFeature.findMany({ where: { userId: id }, select: { feature: true } }),
      db.userPayrollEmployeeScope.findMany({ where: { userId: id }, select: { employeeId: true } }),
    ]);

    return NextResponse.json({
      data: {
        features: featureRows.map((r) => r.feature),
        employeeIds: employeeRows.map((r) => r.employeeId),
      },
    });
  } catch (error) {
    return handleApiError(error, "fetch payroll access");
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin"]);
    const { id } = await params;

    if (id === session.userId) {
      return apiError("Use your own account settings to manage yourself, not this endpoint.", 400);
    }

    const body = await request.json();
    const { features, employeeIds } = payrollAccessSchema.parse(body);

    const user = await db.user.findUnique({ where: { id } });
    if (!user) {
      return apiError("User not found", 404);
    }
    if (user.role !== "hr") {
      return apiError("Payroll access restrictions only apply to hr users.", 400);
    }

    if (employeeIds.length > 0) {
      const found = await db.employee.findMany({ where: { id: { in: employeeIds } }, select: { id: true } });
      const foundIds = new Set(found.map((e) => e.id));
      const missing = employeeIds.filter((eid) => !foundIds.has(eid));
      if (missing.length > 0) {
        return apiError(`Employee(s) not found: ${missing.join(", ")}`, 404);
      }
    }

    await db.$transaction([
      db.userPayrollFeature.deleteMany({ where: { userId: id } }),
      db.userPayrollEmployeeScope.deleteMany({ where: { userId: id } }),
      ...(features.length > 0
        ? [db.userPayrollFeature.createMany({ data: features.map((feature) => ({ userId: id, feature })) })]
        : []),
      ...(employeeIds.length > 0
        ? [db.userPayrollEmployeeScope.createMany({ data: employeeIds.map((employeeId) => ({ userId: id, employeeId })) })]
        : []),
    ]);

    await logAudit({ session, action: "update", entity: "UserPayrollAccess", entityId: id, details: { features, employeeIds } });

    return NextResponse.json({ data: { features, employeeIds } });
  } catch (error) {
    return handleApiError(error, "update payroll access");
  }
}
