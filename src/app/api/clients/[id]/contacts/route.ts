import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createContactSchema } from "@/lib/validations/workforce";
import { apiError, handleApiError } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { isFullAccess } from "@/lib/workforce/access";
import { visibleClientAndProjectIds } from "@/lib/workforce/scope-server";

// GET /api/clients/[id]/contacts — admin/hr, or a coordinator whose assignments include this client.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr", "manager"]);
    const { id } = await params;
    if (!isFullAccess(session.role) && !(await visibleClientAndProjectIds(session)).clientIds.has(id)) {
      return apiError("Client not found", 404);
    }
    const contacts = await db.clientContact.findMany({ where: { clientId: id }, orderBy: { name: "asc" } });
    return NextResponse.json({ data: contacts });
  } catch (error) {
    return handleApiError(error, "fetch client contacts");
  }
}

// POST /api/clients/[id]/contacts — admin/hr only.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id } = await params;
    const client = await db.client.findUnique({ where: { id } });
    if (!client) return apiError("Client not found", 404);

    const parsed = createContactSchema.parse(await request.json());
    if (!parsed.phone && !parsed.email) {
      return apiError("A contact needs at least a phone number or an email.", 400);
    }
    const contact = await db.clientContact.create({
      data: { clientId: id, name: parsed.name, phone: parsed.phone ?? null, email: parsed.email ?? null, kind: parsed.kind },
    });
    await logAudit({ session, action: "create", entity: "ClientContact", entityId: contact.id, details: { clientId: id, name: contact.name, kind: contact.kind } });
    return NextResponse.json({ data: contact }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "create client contact");
  }
}
