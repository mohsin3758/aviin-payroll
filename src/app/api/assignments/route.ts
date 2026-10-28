import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createAssignmentSchema } from "@/lib/validations/workforce";
import { apiError, handleApiError } from "@/lib/api-utils";
import { requireRole, requireAuth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { istDateOnly } from "@/lib/date-ist";
import { serializeAssignment, visibleAssignments } from "@/lib/workforce/scope-server";
import { validateAssignment } from "@/lib/workforce/assignment-validate";

// GET /api/assignments?projectId=&employeeId=&status= — admin/hr see all (with pay terms); a
// coordinator sees only assignments they coordinate and a contractor only their own, both without
// pay terms, and only where the Contractor Workforce module is switched on for that client/project.
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const sp = request.nextUrl.searchParams;
    const extra: Record<string, string> = {};
    for (const key of ["projectId", "employeeId", "status"] as const) {
      const value = sp.get(key);
      if (value) extra[key] = value;
    }
    const rows = await visibleAssignments(session, extra);
    return NextResponse.json({ data: rows.map((r) => serializeAssignment(r, session)) });
  } catch (error) {
    return handleApiError(error, "fetch assignments");
  }
}

// POST /api/assignments — admin/hr only.
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const parsed = createAssignmentSchema.parse(await request.json());

    const startDate = istDateOnly(parsed.startDate);
    const endDate = parsed.endDate ? istDateOnly(parsed.endDate) : null;
    const status = parsed.status ?? "planned";
    const contractType = parsed.contractType ?? "exclusive";

    const failure = await validateAssignment({
      employeeId: parsed.employeeId,
      projectId: parsed.projectId,
      clientRepContactId: parsed.clientRepContactId ?? null,
      coordinatorUserIds: [parsed.resourceCoordinatorId ?? null, parsed.clientCoordinatorId ?? null, parsed.kamId ?? null],
      startDate,
      endDate,
      contractType,
      status,
      payRate: parsed.payRate ?? null,
    });
    if (failure) return apiError(failure.problems.join(" "), failure.status);

    const assignment = await db.assignment.create({
      data: {
        employeeId: parsed.employeeId,
        projectId: parsed.projectId,
        clientRepContactId: parsed.clientRepContactId ?? null,
        resourceCoordinatorId: parsed.resourceCoordinatorId ?? null,
        clientCoordinatorId: parsed.clientCoordinatorId ?? null,
        kamId: parsed.kamId ?? null,
        startDate,
        endDate,
        workMode: parsed.workMode ?? "remote",
        location: parsed.location ?? null,
        timezone: parsed.timezone ?? "Asia/Kolkata",
        tier: parsed.tier ?? "full_time",
        expectedHoursPerDay: parsed.expectedHoursPerDay ?? null,
        expectedHoursPerWeek: parsed.expectedHoursPerWeek ?? null,
        workingDays: parsed.workingDays ?? "1,2,3,4,5",
        contractType,
        declarationAt: parsed.declarationAt ?? null,
        declarationNote: parsed.declarationNote ?? null,
        payType: parsed.payType ?? "monthly",
        payRate: parsed.payRate ?? null,
        monthlyDayBasis: parsed.monthlyDayBasis ?? "working",
        status,
      },
    });
    await logAudit({
      session,
      action: "create",
      entity: "Assignment",
      entityId: assignment.id,
      details: { employeeId: assignment.employeeId, projectId: assignment.projectId, contractType, payType: assignment.payType, payRate: assignment.payRate },
    });
    return NextResponse.json({ data: assignment }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "create assignment");
  }
}
