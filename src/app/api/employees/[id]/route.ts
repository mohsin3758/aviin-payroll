import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateEmployeeSchema } from "@/lib/validations/employee";
import { apiError, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { requireAuth, requireRole } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request);
    const { id } = await params;

    const employee = await db.employee.findUnique({
      where: { id },
      include: { salaryStructure: true },
    });

    if (!employee) {
      return apiError("Employee not found", 404);
    }

    return NextResponse.json(employee);
  } catch (error) {
    return handleApiError(error, "fetch employee");
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id } = await params;
    const body = await request.json();
    const parsed = updateEmployeeSchema.parse(body);
    const { salaryStructure: salaryStructureData, ...employeeData } = parsed;

    const existing = await db.employee.findUnique({
      where: { id },
      include: { salaryStructure: true },
    });

    if (!existing) {
      return apiError("Employee not found", 404);
    }

    // Build salary structure update payload
    let salaryPayload: Record<string, unknown> | undefined;
    if (salaryStructureData) {
      if (existing.salaryStructure) {
        salaryPayload = { update: salaryStructureData };
      } else {
        salaryPayload = { create: salaryStructureData };
      }
    }

    const employee = await db.employee.update({
      where: { id },
      data: {
        ...employeeData,
        ...(salaryPayload ? { salaryStructure: salaryPayload } : {}),
      },
      include: { salaryStructure: true },
    });

    await logAudit({
      session,
      action: "update",
      entity: "Employee",
      entityId: employee.id,
      details: { changedFields: Object.keys(employeeData) },
    });

    return NextResponse.json(employee);
  } catch (error) {
    return handleApiError(error, "update employee");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id } = await params;

    const existing = await db.employee.findUnique({ where: { id } });

    if (!existing) {
      return apiError("Employee not found", 404);
    }

    const employee = await db.employee.update({
      where: { id },
      data: { dateOfExit: new Date() },
      include: { salaryStructure: true },
    });

    await logAudit({
      session,
      action: "delete",
      entity: "Employee",
      entityId: employee.id,
      details: { employeeCode: employee.employeeCode },
    });

    return NextResponse.json(employee);
  } catch (error) {
    return handleApiError(error, "delete employee");
  }
}