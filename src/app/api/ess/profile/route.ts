import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOwnEmployeeId } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { updateOwnProfileSchema } from "@/lib/validations/ess";
import { logAudit } from "@/lib/audit";

// GET /api/ess/profile — the current user's own employee record + family/education/experience.
export async function GET(request: NextRequest) {
  try {
    const { employeeId } = await requireOwnEmployeeId(request);

    const employee = await db.employee.findUnique({
      where: { id: employeeId },
      include: {
        company: { select: { name: true, address: true } },
        salaryStructure: true,
        familyMembers: { orderBy: { createdAt: "asc" } },
        education: { orderBy: { yearOfPassing: "desc" } },
        experiences: { orderBy: { fromDate: "desc" } },
      },
    });
    if (!employee) {
      return apiError("Employee record not found", 404);
    }

    return NextResponse.json({ data: employee });
  } catch (error) {
    return handleApiError(error, "fetch own profile");
  }
}

// PUT /api/ess/profile — self-editable contact fields only. Bank/PAN/Aadhaar/UAN are
// deliberately read-only here — changes go through document upload + HR verification instead.
export async function PUT(request: NextRequest) {
  try {
    const { session, employeeId } = await requireOwnEmployeeId(request);
    const body = await request.json();
    const parsed = updateOwnProfileSchema.parse(body);

    const employee = await db.employee.update({ where: { id: employeeId }, data: parsed });

    await logAudit({ session, action: "update", entity: "Employee", entityId: employeeId, details: { self: true, fields: Object.keys(parsed) } });

    return NextResponse.json({ data: employee });
  } catch (error) {
    return handleApiError(error, "update own profile");
  }
}
