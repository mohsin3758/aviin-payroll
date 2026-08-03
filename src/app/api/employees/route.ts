import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createEmployeeSchema } from "@/lib/validations/employee";
import { apiError, getDefaultCompanyId, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { requireRole, scopeToOwnEmployeeIfSelf } from "@/lib/auth";
import { generateNextEmployeeCode } from "@/lib/employee-code";

export async function GET(request: NextRequest) {
  try {
    // employee role: silently restricted to their own record (matches the ESS routes'
    // pattern) rather than 403ing, since this route also backs an employee's own lookups.
    // manager: sees everyone, but never salary figures — see include below.
    const { session, forcedEmployeeId } = await scopeToOwnEmployeeIfSelf(request);
    const { searchParams } = request.nextUrl;
    const search = searchParams.get("search") ?? "";
    const department = searchParams.get("department");
    const state = searchParams.get("state");
    // "wfh" -> exemptFromGeofence employees; "default" -> no branch assigned, not WFH (head
    // office); any other value -> assigned to that specific OfficeLocation id.
    const workLocation = searchParams.get("workLocation");
    const onboardingStatus = searchParams.get("onboardingStatus");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));

    const where: Record<string, unknown> = {
      dateOfExit: null,
    };

    if (forcedEmployeeId) {
      where.id = forcedEmployeeId;
    } else {
      if (search) {
        // Note: SQLite's Prisma provider doesn't support `mode: "insensitive"` (unlike
        // Postgres/MySQL) — `contains` is already case-insensitive for ASCII on SQLite by default.
        where.OR = [
          { firstName: { contains: search } },
          { lastName: { contains: search } },
          { employeeCode: { contains: search } },
        ];
      }

      if (department) {
        where.department = department;
      }

      if (state) {
        where.state = state;
      }

      if (workLocation === "wfh") {
        where.exemptFromGeofence = true;
      } else if (workLocation === "default") {
        where.exemptFromGeofence = false;
        where.officeLocationId = null;
      } else if (workLocation) {
        where.officeLocationId = workLocation;
      }

      if (onboardingStatus) {
        where.onboardingStatus = onboardingStatus;
      }
    }

    const [employees, total] = await Promise.all([
      db.employee.findMany({
        where,
        include: { salaryStructure: session.role !== "manager" },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.employee.count({ where }),
    ]);

    return NextResponse.json({
      data: employees,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    return handleApiError(error, "fetch employees");
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const body = await request.json();
    const parsed = createEmployeeSchema.parse(body);
    const { salaryStructure: salaryStructureData, employeeCode, ...employeeData } = parsed;

    // Generate employeeCode if not provided
    const code = employeeCode || (await generateNextEmployeeCode());

    const companyId = await getDefaultCompanyId();

    const existingEmail = await db.employee.findFirst({ where: { email: employeeData.email, dateOfExit: null } });
    if (existingEmail) {
      return apiError("An active employee with this email already exists.", 409);
    }

    const employee = await db.employee.create({
      data: {
        ...employeeData,
        companyId,
        employeeCode: code,
        salaryStructure: salaryStructureData
          ? { create: salaryStructureData }
          : undefined,
      },
      include: { salaryStructure: true },
    });

    await logAudit({
      session,
      action: "create",
      entity: "Employee",
      entityId: employee.id,
      details: { employeeCode: employee.employeeCode, name: `${employee.firstName} ${employee.lastName ?? ""}`.trim() },
    });

    return NextResponse.json(employee, { status: 201 });
  } catch (error) {
    return handleApiError(error, "create employee");
  }
}
