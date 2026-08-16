import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateEmployeeSchema } from "@/lib/validations/employee";
import { apiError, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { requirePayrollFeature, requirePayrollSelfOrFeature, assertEmployeeInScope } from "@/lib/payroll-access";
import { calculateGrossSalary } from "@/lib/payroll/engine";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // Matches the employees-list policy: self, or admin/hr/manager may view any record, but
    // manager never sees salaryStructure (full PAN/Aadhaar/bank/DOB/address is fine for
    // manager to see here, same as the list route — only compensation figures are stripped).
    // An hr caller is additionally subject to their view_employees feature/employee-scope
    // restriction, if any — no-op for admin/manager/self.
    const { session } = await requirePayrollSelfOrFeature(request, id, ["admin", "hr", "manager"], "view_employees");

    const employee = await db.employee.findUnique({
      where: { id },
      include: { salaryStructure: session.role !== "manager" },
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
    const { id } = await params;
    const { session, restriction } = await requirePayrollFeature(request, ["admin", "hr"], "edit_employee");
    assertEmployeeInScope(restriction, id);
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

    if (employeeData.officeLocationId) {
      const location = await db.officeLocation.findUnique({ where: { id: employeeData.officeLocationId } });
      if (!location) return apiError("Office location not found", 404);
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
    const { id } = await params;
    const { session, restriction } = await requirePayrollFeature(request, ["admin", "hr"], "edit_employee");
    assertEmployeeInScope(restriction, id);

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