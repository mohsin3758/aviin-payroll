import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePayrollFeature, requirePayrollSelfOrFeature, assertEmployeeInScope } from "@/lib/payroll-access";
import { apiError, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

const createTaskSchema = z.object({
  employeeId: z.string().min(1),
  taskName: z.string().trim().min(1).max(200),
  order: z.number().int().min(0).default(0),
});

// GET /api/onboarding/tasks?employeeId= — self or admin/hr (Onboarding is admin/hr-only
// elsewhere in the app; not extended to manager here either).
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const employeeId = searchParams.get("employeeId");
    if (!employeeId) return apiError("employeeId is required", 400);
    await requirePayrollSelfOrFeature(request, employeeId, ["admin", "hr"], "manage_onboarding");

    const tasks = await db.onboardingTask.findMany({
      where: { employeeId },
      orderBy: { order: "asc" },
    });
    return NextResponse.json({ data: tasks });
  } catch (error) {
    return handleApiError(error, "fetch onboarding tasks");
  }
}

// POST /api/onboarding/tasks — admin/hr only, adds a single checklist item.
export async function POST(request: NextRequest) {
  try {
    const { session, restriction } = await requirePayrollFeature(request, ["admin", "hr"], "manage_onboarding");
    const body = await request.json();
    const parsed = createTaskSchema.parse(body);
    assertEmployeeInScope(restriction, parsed.employeeId);

    const task = await db.onboardingTask.create({ data: parsed });

    await logAudit({ session, action: "create", entity: "OnboardingTask", entityId: task.id });

    return NextResponse.json({ data: task }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "add onboarding task");
  }
}
