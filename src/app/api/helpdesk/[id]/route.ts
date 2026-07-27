import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { updateTicketSchema } from "@/lib/validations/helpdesk";
import { logAudit } from "@/lib/audit";
import { notifyEmployee } from "@/lib/notifications";

// GET /api/helpdesk/[id] — the ticket with its full reply thread.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(request);
    const { id } = await params;

    const ticket = await db.helpDeskTicket.findUnique({
      where: { id },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeCode: true } },
        replies: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!ticket) return apiError("Ticket not found", 404);
    if (session.role === "employee" && session.employeeId !== ticket.employeeId) {
      return apiError("You can only view your own tickets.", 403);
    }

    return NextResponse.json({ data: ticket });
  } catch (error) {
    return handleApiError(error, "fetch help desk ticket");
  }
}

// PUT /api/helpdesk/[id] — admin/hr only, updates ticket status.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id } = await params;
    const body = await request.json();
    const { status } = updateTicketSchema.parse(body);

    const existing = await db.helpDeskTicket.findUnique({ where: { id } });
    if (!existing) return apiError("Ticket not found", 404);

    const ticket = await db.helpDeskTicket.update({ where: { id }, data: { status } });

    await logAudit({ session, action: "update", entity: "HelpDeskTicket", entityId: id, details: { status } });

    await notifyEmployee(existing.employeeId, {
      title: "Help desk ticket updated",
      message: `Your ticket "${existing.subject}" is now ${status.replace("_", " ")}.`,
      category: "helpdesk",
    });

    return NextResponse.json({ data: ticket });
  } catch (error) {
    return handleApiError(error, "update help desk ticket");
  }
}
