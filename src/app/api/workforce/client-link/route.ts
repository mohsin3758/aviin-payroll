import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { isFullAccess } from "@/lib/workforce/access";
import { visibleClientAndProjectIds } from "@/lib/workforce/scope-server";
import { createActionToken } from "@/lib/workforce/tokens";
import { publicBaseUrl } from "@/lib/workforce/templates";
import { parseDay, workforceError } from "@/lib/workforce/route-helpers";

const schema = z.object({ contactId: z.string().min(1), projectId: z.string().min(1), date: z.string().optional() });

// POST /api/workforce/client-link — admin/hr, or a coordinator on that project. Creates a 72-hour
// confirmation link for a client representative, to send by hand (e.g. before WhatsApp is set up,
// or by email). It shows only that representative's own contractors for that project, no pay figures.
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin", "hr", "manager"]);
    const body = schema.parse(await request.json());
    if (!isFullAccess(session.role) && !(await visibleClientAndProjectIds(session)).projectIds.has(body.projectId)) return apiError("Not found", 404);

    const project = await db.project.findUnique({ where: { id: body.projectId } });
    const contact = await db.clientContact.findUnique({ where: { id: body.contactId } });
    if (!project || !contact || contact.clientId !== project.clientId || !contact.active) return apiError("That contact does not belong to this project's client.", 400);
    const date = body.date ? parseDay(body.date) : new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
    if (!date) return apiError("date must be YYYY-MM-DD.", 400);

    const token = await createActionToken({ purpose: "client", contactId: contact.id, projectId: project.id, date, ttlHours: 72 });
    await logAudit({ session, action: "create_link", entity: "ClientContact", entityId: contact.id, details: { purpose: "client", projectId: project.id } });
    return NextResponse.json({ data: { url: `${publicBaseUrl()}/c/${token}`, token, expiresInHours: 72 } }, { status: 201 });
  } catch (error) {
    return workforceError(error, "create client link");
  }
}
