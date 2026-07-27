import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

const updateTaskSchema = z.object({ isCompleted: z.boolean() });

// PUT /api/onboarding/tasks/[id] — admin/hr only, toggles a checklist item.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id } = await params;
    const body = await request.json();
    const { isCompleted } = updateTaskSchema.parse(body);

    const existing = await db.onboardingTask.findUnique({ where: { id } });
    if (!existing) return apiError("Task not found", 404);

    const task = await db.onboardingTask.update({
      where: { id },
      data: {
        isCompleted,
        completedBy: isCompleted ? session.userId : null,
        completedAt: isCompleted ? new Date() : null,
      },
    });

    await logAudit({ session, action: "update", entity: "OnboardingTask", entityId: id, details: { isCompleted } });

    return NextResponse.json({ data: task });
  } catch (error) {
    return handleApiError(error, "update onboarding task");
  }
}

// DELETE /api/onboarding/tasks/[id] — admin/hr only.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id } = await params;

    const existing = await db.onboardingTask.findUnique({ where: { id } });
    if (!existing) return apiError("Task not found", 404);

    await db.onboardingTask.delete({ where: { id } });
    await logAudit({ session, action: "delete", entity: "OnboardingTask", entityId: id });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "delete onboarding task");
  }
}
