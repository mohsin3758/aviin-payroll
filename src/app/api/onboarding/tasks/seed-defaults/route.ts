import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

const seedSchema = z.object({ employeeId: z.string().min(1) });

const DEFAULT_TASKS = [
  "Offer letter sent",
  "Appointment letter issued",
  "KYC documents collected (PAN/Aadhaar)",
  "Bank details verified",
  "Asset allocated",
  "Portal login activated",
  "Induction / orientation completed",
];

// POST /api/onboarding/tasks/seed-defaults — admin/hr only. Creates the standard onboarding
// checklist for a new employee in one action (skips if tasks already exist for them).
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const body = await request.json();
    const { employeeId } = seedSchema.parse(body);

    const employee = await db.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return apiError("Employee not found", 404);

    const existingCount = await db.onboardingTask.count({ where: { employeeId } });
    if (existingCount > 0) {
      return apiError("This employee already has an onboarding checklist.", 409);
    }

    const tasks = await db.$transaction(
      DEFAULT_TASKS.map((taskName, order) =>
        db.onboardingTask.create({ data: { employeeId, taskName, order } })
      )
    );

    await logAudit({ session, action: "create", entity: "OnboardingTask", entityId: employeeId, details: { seeded: tasks.length } });

    return NextResponse.json({ data: tasks }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "seed onboarding checklist");
  }
}
