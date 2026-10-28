import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateContactSchema } from "@/lib/validations/workforce";
import { apiError, handleApiError } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// PUT /api/clients/[id]/contacts/[contactId] — admin/hr only. Contacts are deactivated, not deleted.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string; contactId: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id, contactId } = await params;
    const existing = await db.clientContact.findUnique({ where: { id: contactId } });
    // The contact must belong to the client named in the URL, so one client's contact can't be
    // edited by guessing its id under a different client's path.
    if (!existing || existing.clientId !== id) return apiError("Contact not found", 404);

    const parsed = updateContactSchema.parse(await request.json());
    const nextPhone = parsed.phone !== undefined ? parsed.phone : existing.phone;
    const nextEmail = parsed.email !== undefined ? parsed.email : existing.email;
    if (!nextPhone && !nextEmail) {
      return apiError("A contact needs at least a phone number or an email.", 400);
    }

    const contact = await db.clientContact.update({ where: { id: contactId }, data: parsed });
    await logAudit({ session, action: "update", entity: "ClientContact", entityId: contactId, details: { clientId: id } });
    return NextResponse.json({ data: contact });
  } catch (error) {
    return handleApiError(error, "update client contact");
  }
}
