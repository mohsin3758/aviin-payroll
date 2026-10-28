import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateClientSchema } from "@/lib/validations/workforce";
import { apiError, handleApiError } from "@/lib/api-utils";
import { requireRole, type SessionPayload } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { isFullAccess } from "@/lib/workforce/access";
import { visibleClientAndProjectIds } from "@/lib/workforce/scope-server";
import { normalizeClientName } from "@/lib/workforce/naming";

/** 404 (not 403) when a coordinator asks for a client outside their scope, so ids don't leak. */
async function callerCanSeeClient(session: SessionPayload, clientId: string): Promise<boolean> {
  if (isFullAccess(session.role)) return true;
  return (await visibleClientAndProjectIds(session)).clientIds.has(clientId);
}

// GET /api/clients/[id]
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr", "manager"]);
    const { id } = await params;
    if (!(await callerCanSeeClient(session, id))) return apiError("Client not found", 404);

    const client = await db.client.findUnique({
      where: { id },
      include: { contacts: { orderBy: { name: "asc" } }, projects: { orderBy: { name: "asc" } } },
    });
    if (!client) return apiError("Client not found", 404);
    return NextResponse.json({ data: client });
  } catch (error) {
    return handleApiError(error, "fetch client");
  }
}

// PUT /api/clients/[id] — admin/hr only. Clients are deactivated (active=false), never deleted.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id } = await params;
    const existing = await db.client.findUnique({ where: { id } });
    if (!existing) return apiError("Client not found", 404);

    const parsed = updateClientSchema.parse(await request.json());
    const data: Record<string, unknown> = { ...parsed };

    if (parsed.name !== undefined) {
      const normalizedName = normalizeClientName(parsed.name);
      const collision = await db.client.findUnique({
        where: { companyId_normalizedName: { companyId: existing.companyId, normalizedName } },
      });
      if (collision && collision.id !== id) {
        return apiError(`A client with a matching name already exists: "${collision.name}" (${collision.code}).`, 409);
      }
      data.normalizedName = normalizedName;
    }

    const client = await db.client.update({ where: { id }, data });
    await logAudit({ session, action: "update", entity: "Client", entityId: id, details: parsed });
    return NextResponse.json({ data: client });
  } catch (error) {
    return handleApiError(error, "update client");
  }
}
