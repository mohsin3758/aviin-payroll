import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateAssignmentSchema } from "@/lib/validations/workforce";
import { apiError, handleApiError } from "@/lib/api-utils";
import { requireAuth, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { istDateOnly } from "@/lib/date-ist";
import { serializeAssignment, visibleAssignments } from "@/lib/workforce/scope-server";
import { validateAssignment } from "@/lib/workforce/assignment-validate";

// GET /api/assignments/[id] — same visibility rules as the list; 404 (not 403) outside scope.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(request);
    const { id } = await params;
    const [row] = await visibleAssignments(session, { id });
    if (!row) return apiError("Assignment not found", 404);
    return NextResponse.json({ data: serializeAssignment(row, session) });
  } catch (error) {
    return handleApiError(error, "fetch assignment");
  }
}

// PUT /api/assignments/[id] — admin/hr only. Pay-term changes are audited with old and new values.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id } = await params;
    const existing = await db.assignment.findUnique({ where: { id } });
    if (!existing) return apiError("Assignment not found", 404);

    const parsed = updateAssignmentSchema.parse(await request.json());
    const startDate = parsed.startDate ? istDateOnly(parsed.startDate) : existing.startDate;
    const endDate = parsed.endDate === undefined ? existing.endDate : parsed.endDate ? istDateOnly(parsed.endDate) : null;
    if (endDate && endDate < startDate) return apiError("endDate cannot be before startDate.", 400);

    const merged = {
      resourceCoordinatorId: parsed.resourceCoordinatorId === undefined ? existing.resourceCoordinatorId : parsed.resourceCoordinatorId,
      clientCoordinatorId: parsed.clientCoordinatorId === undefined ? existing.clientCoordinatorId : parsed.clientCoordinatorId,
      kamId: parsed.kamId === undefined ? existing.kamId : parsed.kamId,
      clientRepContactId: parsed.clientRepContactId === undefined ? existing.clientRepContactId : parsed.clientRepContactId,
      contractType: parsed.contractType ?? existing.contractType,
      status: parsed.status ?? existing.status,
      payRate: parsed.payRate === undefined ? existing.payRate : parsed.payRate,
    };

    const failure = await validateAssignment({
      id,
      employeeId: existing.employeeId,
      projectId: existing.projectId,
      clientRepContactId: merged.clientRepContactId,
      coordinatorUserIds: [merged.resourceCoordinatorId, merged.clientCoordinatorId, merged.kamId],
      startDate,
      endDate,
      contractType: merged.contractType,
      status: merged.status,
      payRate: merged.payRate,
    });
    if (failure) return apiError(failure.problems.join(" "), failure.status);

    const { startDate: _s, endDate: _e, ...rest } = parsed;
    void _s; void _e;
    const updated = await db.assignment.update({ where: { id }, data: { ...rest, startDate, endDate } });

    const payChanged =
      updated.payType !== existing.payType || updated.payRate !== existing.payRate || updated.monthlyDayBasis !== existing.monthlyDayBasis;
    await logAudit({
      session,
      action: payChanged ? "update_pay_terms" : "update",
      entity: "Assignment",
      entityId: id,
      details: {
        changes: parsed,
        ...(payChanged
          ? {
              before: { payType: existing.payType, payRate: existing.payRate, monthlyDayBasis: existing.monthlyDayBasis },
              after: { payType: updated.payType, payRate: updated.payRate, monthlyDayBasis: updated.monthlyDayBasis },
            }
          : {}),
      },
    });
    return NextResponse.json({ data: updated });
  } catch (error) {
    return handleApiError(error, "update assignment");
  }
}
