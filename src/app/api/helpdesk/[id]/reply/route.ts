import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { replySchema } from "@/lib/validations/helpdesk";
import { logAudit } from "@/lib/audit";
import { notifyEmployee, notifyRoles } from "@/lib/notifications";

// POST /api/helpdesk/[id]/reply — the ticket owner or admin/hr can add a reply.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(request);
    const { id } = await params;
    const body = await request.json();
    const { message } = replySchema.parse(body);

    const ticket = await db.helpDeskTicket.findUnique({ where: { id } });
    if (!ticket) return apiError("Ticket not found", 404);
    if (session.role === "employee" && session.employeeId !== ticket.employeeId) {
      return apiError("You can only reply to your own tickets.", 403);
    }

    const reply = await db.helpDeskReply.create({
      data: { ticketId: id, authorUserId: session.userId, authorName: session.name, message },
    });
    await db.helpDeskTicket.update({ where: { id }, data: { updatedAt: new Date() } });

    await logAudit({ session, action: "create", entity: "HelpDeskReply", entityId: reply.id });

    if (session.role === "employee") {
      await notifyRoles(["admin", "hr"], {
        title: "New help desk reply",
        message: `${session.name} replied on "${ticket.subject}"`,
        category: "helpdesk",
      });
    } else {
      await notifyEmployee(ticket.employeeId, {
        title: "Help desk reply",
        message: `${session.name} replied on your ticket "${ticket.subject}"`,
        category: "helpdesk",
      });
    }

    return NextResponse.json({ data: reply }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "reply to help desk ticket");
  }
}
