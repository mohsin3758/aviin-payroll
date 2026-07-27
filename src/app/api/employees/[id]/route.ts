import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateEmployeeSchema } from "@/lib/validations/employee";
import { apiError, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { requireAuth, requireRole } from "@/lib/auth";
import { calculateGrossSalary } from "@/lib/payroll/engine";

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

    // Append-only salary revision history — logged whenever an edit actually changes the
    // structure, alongside (not instead of) the mutable SalaryStructure row itself.
    if (existing.salaryStructure && employee.salaryStructure) {
      const previousGross = calculateGrossSalary(existing.salaryStructure);
      const newGross = calculateGrossSalary(employee.salaryStructure);
      if (previousGross !== newGross || existing.salaryStructure.basic !== employee.salaryStructure.basic) {
        await db.salaryRevision.create({
          data: {
            employeeId: employee.id,
            effectiveDate: new Date(),
            reason: "correction",
            previousBasic: existing.salaryStructure.basic,
            newBasic: employee.salaryStructure.basic,
            previousGross,
            newGross,
            approvedBy: session.userId,
          },
        });
      }
    }

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