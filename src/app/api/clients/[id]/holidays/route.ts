import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createClientHolidaySchema } from "@/lib/validations/workforce";
import { apiError, handleApiError } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { istDateOnly } from "@/lib/date-ist";
import { isFullAccess } from "@/lib/workforce/access";
import { visibleClientAndProjectIds } from "@/lib/workforce/scope-server";

// GET /api/clients/[id]/holidays?year=2026 — this client's own holiday calendar (separate from
// the company-wide Holiday table, since a contractor's working days follow THEIR client's calendar).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr", "manager"]);
    const { id } = await params;
    if (!isFullAccess(session.role) && !(await visibleClientAndProjectIds(session)).clientIds.has(id)) {
      return apiError("Client not found", 404);
    }

    const yearParam = request.nextUrl.searchParams.get("year");
    const where: Record<string, unknown> = { clientId: id };
    if (yearParam) {
      const year = parseInt(yearParam, 10);
      if (!Number.isInteger(year)) return apiError("year must be a number", 400);
      where.date = { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) };
    }
    const holidays = await db.clientHoliday.findMany({ where, orderBy: { date: "asc" } });
    return NextResponse.json({ data: holidays });
  } catch (error) {
    return handleApiError(error, "fetch client holidays");
  }
}

// POST /api/clients/[id]/holidays — admin/hr only.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id } = await params;
    const client = await db.client.findUnique({ where: { id } });
    if (!client) return apiError("Client not found", 404);

    const parsed = createClientHolidaySchema.parse(await request.json());
    const date = istDateOnly(parsed.date);

    const existing = await db.clientHoliday.findUnique({ where: { clientId_date: { clientId: id, date } } });
    if (existing) return apiError(`A holiday ("${existing.name}") is already set for this client on that date.`, 409);

    const holiday = await db.clientHoliday.create({ data: { clientId: id, date, name: parsed.name } });
    await logAudit({ session, action: "create", entity: "ClientHoliday", entityId: holiday.id, details: { clientId: id, name: holiday.name, date: date.toISOString() } });
    return NextResponse.json({ data: holiday }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "create client holiday");
  }
}
