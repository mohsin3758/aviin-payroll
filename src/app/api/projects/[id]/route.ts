import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateProjectSchema } from "@/lib/validations/workforce";
import { apiError, handleApiError } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { istDateOnly } from "@/lib/date-ist";
import { isFullAccess } from "@/lib/workforce/access";
import { visibleClientAndProjectIds } from "@/lib/workforce/scope-server";

// GET /api/projects/[id]
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr", "manager"]);
    const { id } = await params;
    if (!isFullAccess(session.role) && !(await visibleClientAndProjectIds(session)).projectIds.has(id)) {
      return apiError("Project not found", 404);
    }
    const project = await db.project.findUnique({ where: { id }, include: { client: { select: { id: true, code: true, name: true } } } });
    if (!project) return apiError("Project not found", 404);
    return NextResponse.json({ data: project });
  } catch (error) {
    return handleApiError(error, "fetch project");
  }
}

// PUT /api/projects/[id] — admin/hr only. Projects are deactivated, never deleted.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id } = await params;
    const existing = await db.project.findUnique({ where: { id } });
    if (!existing) return apiError("Project not found", 404);

    const parsed = updateProjectSchema.parse(await request.json());
    const startDate = parsed.startDate === undefined ? existing.startDate : parsed.startDate ? istDateOnly(parsed.startDate) : null;
    const endDate = parsed.endDate === undefined ? existing.endDate : parsed.endDate ? istDateOnly(parsed.endDate) : null;
    if (startDate && endDate && endDate < startDate) return apiError("endDate cannot be before startDate.", 400);

    if (parsed.name !== undefined && parsed.name !== existing.name) {
      const collision = await db.project.findUnique({ where: { clientId_name: { clientId: existing.clientId, name: parsed.name } } });
      if (collision) return apiError(`This client already has a project named "${collision.name}".`, 409);
    }

    const { startDate: _s, endDate: _e, ...rest } = parsed;
    void _s; void _e;
    const project = await db.project.update({ where: { id }, data: { ...rest, startDate, endDate } });
    await logAudit({ session, action: "update", entity: "Project", entityId: id, details: parsed });
    return NextResponse.json({ data: project });
  } catch (error) {
    return handleApiError(error, "update project");
  }
}
