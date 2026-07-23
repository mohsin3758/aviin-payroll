import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createHolidaySchema } from "@/lib/validations/holiday";
import { apiError, getDefaultCompanyId, handleApiError } from "@/lib/api-utils";
import { requireAuth, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// GET /api/holidays?year=2026 — visible to every authenticated role (it's the company calendar)
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = request.nextUrl;
    const yearParam = searchParams.get("year");

    const companyId = await getDefaultCompanyId();
    const where: Record<string, unknown> = { companyId };

    if (yearParam) {
      const year = parseInt(yearParam, 10);
      where.date = {
        gte: new Date(Date.UTC(year, 0, 1)),
        lt: new Date(Date.UTC(year + 1, 0, 1)),
      };
    }

    const holidays = await db.holiday.findMany({
      where,
      orderBy: { date: "asc" },
    });

    return NextResponse.json({ data: holidays });
  } catch (error) {
    return handleApiError(error, "fetch holidays");
  }
}

// POST /api/holidays — add a company holiday (applies to every employee automatically)
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const body = await request.json();
    const parsed = createHolidaySchema.parse(body);

    const companyId = await getDefaultCompanyId();

    const existing = await db.holiday.findUnique({
      where: { companyId_date: { companyId, date: parsed.date } },
    });
    if (existing) {
      return apiError(`A holiday ("${existing.name}") is already set for this date.`, 409);
    }

    const holiday = await db.holiday.create({
      data: { ...parsed, companyId },
    });

    await logAudit({
      session,
      action: "create",
      entity: "Holiday",
      entityId: holiday.id,
      details: { name: holiday.name, date: holiday.date.toISOString() },
    });

    return NextResponse.json(holiday, { status: 201 });
  } catch (error) {
    return handleApiError(error, "create holiday");
  }
}
