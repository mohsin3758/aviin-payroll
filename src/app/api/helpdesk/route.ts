import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { createTicketSchema } from "@/lib/validations/helpdesk";
import { logAudit } from "@/lib/audit";
import { notifyRoles } from "@/lib/notifications";

// GET /api/helpdesk?employeeId=&status= — employees see only their own tickets;
// admin/hr/manager see everyone's (optionally filtered).
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status");
    let employeeId = searchParams.get("employeeId");

    if (session.role === "employee") {
      if (!session.employeeId) {
        return apiError("Your login isn't linked to an employee record.", 403);
      }
      employeeId = session.employeeId;
    }

    const where: Record<string, unknown> = {};
    if (employeeId) where.employeeId = employeeId;
    if (status) where.status = status;

    const tickets = await db.helpDeskTicket.findMany({
      where,
      include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } }, _count: { select: { replies: true } } },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ data: tickets });
  } catch (error) {
    return handleApiError(error, "fetch help desk tickets");
  }
}

// POST /api/helpdesk — an employee raises a ticket for themselves.
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    if (!session.employeeId) {
      return apiError("Your login isn't linked to an employee record.", 403);
    }

    const body = await request.json();
    const parsed = createTicketSchema.parse(body);

    const ticket = await db.helpDeskTicket.create({
      data: { employeeId: session.employeeId, ...parsed },
    });

    await logAudit({ session, action: "create", entity: "HelpDeskTicket", entityId: ticket.id });

    await notifyRoles(["admin", "hr"], {
      title: "New help desk ticket",
      message: `${session.name} raised: "${parsed.subject}"`,
      category: "helpdesk",
      link: "helpdesk",
    });

    return NextResponse.json({ data: ticket }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "create help desk ticket");
  }
}
