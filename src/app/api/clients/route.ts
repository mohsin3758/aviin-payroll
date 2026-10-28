import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createClientSchema } from "@/lib/validations/workforce";
import { apiError, getDefaultCompanyId, handleApiError } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { isFullAccess } from "@/lib/workforce/access";
import { visibleClientAndProjectIds } from "@/lib/workforce/scope-server";
import { normalizeClientName, nextClientCode } from "@/lib/workforce/naming";

// GET /api/clients — admin/hr see every client; a manager (coordinator) sees only the clients of
// assignments they coordinate, and only where the Contractor Workforce module is switched on.
export async function GET(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin", "hr", "manager"]);
    const where = isFullAccess(session.role)
      ? {}
      : { id: { in: [...(await visibleClientAndProjectIds(session)).clientIds] } };

    const clients = await db.client.findMany({
      where,
      orderBy: { name: "asc" },
      include: { _count: { select: { projects: true, contacts: true } } },
    });
    return NextResponse.json({ data: clients });
  } catch (error) {
    return handleApiError(error, "fetch clients");
  }
}

// POST /api/clients — admin/hr only. Names that normalize to an existing client's name (case,
// punctuation and "Pvt Ltd"-style suffixes ignored) are rejected as duplicates, never merged.
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const parsed = createClientSchema.parse(await request.json());
    const companyId = await getDefaultCompanyId();
    const normalizedName = normalizeClientName(parsed.name);

    const duplicate = await db.client.findUnique({ where: { companyId_normalizedName: { companyId, normalizedName } } });
    if (duplicate) {
      return apiError(`A client with a matching name already exists: "${duplicate.name}" (${duplicate.code}).`, 409);
    }

    // Two admins creating clients at once could pick the same next code; the unique index makes
    // the second insert fail, so retry with a freshly computed code instead of surfacing a 500.
    for (let attempt = 0; attempt < 3; attempt++) {
      const codes = (await db.client.findMany({ select: { code: true } })).map((c) => c.code);
      try {
        const client = await db.client.create({
          data: {
            code: nextClientCode(codes),
            companyId,
            name: parsed.name,
            normalizedName,
            timezone: parsed.timezone,
            notes: parsed.notes ?? null,
          },
        });
        await logAudit({ session, action: "create", entity: "Client", entityId: client.id, details: { code: client.code, name: client.name } });
        return NextResponse.json({ data: client }, { status: 201 });
      } catch (error) {
        const isCodeCollision = typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
        if (!isCodeCollision || attempt === 2) throw error;
      }
    }
    return apiError("Could not allocate a client code. Try again.", 500);
  } catch (error) {
    return handleApiError(error, "create client");
  }
}
