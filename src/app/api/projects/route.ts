import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createProjectSchema } from "@/lib/validations/workforce";
import { apiError, handleApiError } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { istDateOnly } from "@/lib/date-ist";
import { isFullAccess } from "@/lib/workforce/access";
import { visibleClientAndProjectIds } from "@/lib/workforce/scope-server";

// GET /api/projects?clientId= — admin/hr see all; a coordinator sees only projects they coordinate.
export async function GET(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin", "hr", "manager"]);
    const clientId = request.nextUrl.searchParams.get("clientId");

    const where: Record<string, unknown> = {};
    if (clientId) where.clientId = clientId;
    if (!isFullAccess(session.role)) {
      where.id = { in: [...(await visibleClientAndProjectIds(session)).projectIds] };
    }

    const projects = await db.project.findMany({
      where,
      orderBy: [{ client: { name: "asc" } }, { name: "asc" }],
      include: { client: { select: { id: true, code: true, name: true } }, _count: { select: { assignments: true } } },
    });
    return NextResponse.json({ data: projects });
  } catch (error) {
    return handleApiError(error, "fetch projects");
  }
}

// POST /api/projects — admin/hr only.
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const parsed = createProjectSchema.parse(await request.json());

    const client = await db.client.findUnique({ where: { id: parsed.clientId } });
    if (!client) return apiError("Client not found", 404);
    if (!client.active) return apiError("Cannot add a project to an inactive client.", 400);
    if (parsed.startDate && parsed.endDate && parsed.endDate < parsed.startDate) {
      return apiError("endDate cannot be before startDate.", 400);
    }

    const duplicate = await db.project.findUnique({ where: { clientId_name: { clientId: parsed.clientId, name: parsed.name } } });
    if (duplicate) return apiError(`This client already has a project named "${duplicate.name}".`, 409);

    const project = await db.project.create({
      data: {
        clientId: parsed.clientId,
        name: parsed.name,
        workMode: parsed.workMode,
        location: parsed.location ?? null,
        timezone: parsed.timezone ?? null,
        startDate: parsed.startDate ? istDateOnly(parsed.startDate) : null,
        endDate: parsed.endDate ? istDateOnly(parsed.endDate) : null,
      },
    });
    await logAudit({ session, action: "create", entity: "Project", entityId: project.id, details: { clientId: project.clientId, name: project.name } });
    return NextResponse.json({ data: project }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "create project");
  }
}
