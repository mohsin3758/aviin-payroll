import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOwnEmployeeId } from "@/lib/auth";
import { apiError, getDefaultCompanyId, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

// GET /api/ess/optional-holidays?year=2026 (or ?fyStartYear=2026) — the Restricted/Optional
// holidays in range, each flagged with whether the current employee has already picked it, plus
// the company's quota and how many the employee has used so far.
export async function GET(request: NextRequest) {
  try {
    const { employeeId } = await requireOwnEmployeeId(request);
    const { searchParams } = request.nextUrl;
    const yearParam = searchParams.get("year");
    const fyStartYearParam = searchParams.get("fyStartYear");

    const companyId = await getDefaultCompanyId();
    const company = await db.company.findUnique({ where: { id: companyId } });
    if (!company) {
      return apiError("No company configured.", 500);
    }

    const where: Record<string, unknown> = { companyId, type: "optional" };
    if (fyStartYearParam) {
      const fyStartYear = parseInt(fyStartYearParam, 10);
      where.date = {
        gte: new Date(Date.UTC(fyStartYear, 3, 1)),
        lt: new Date(Date.UTC(fyStartYear + 1, 3, 1)),
      };
    } else if (yearParam) {
      const year = parseInt(yearParam, 10);
      where.date = {
        gte: new Date(Date.UTC(year, 0, 1)),
        lt: new Date(Date.UTC(year + 1, 0, 1)),
      };
    }

    const holidays = await db.holiday.findMany({ where, orderBy: { date: "asc" } });
    const picks = await db.optionalHolidayPick.findMany({
      where: { employeeId, holidayId: { in: holidays.map((h) => h.id) } },
    });
    const pickedIds = new Set(picks.map((p) => p.holidayId));

    return NextResponse.json({
      data: holidays.map((h) => ({ ...h, chosenByMe: pickedIds.has(h.id) })),
      quota: company.optionalHolidayQuota,
      chosenCount: pickedIds.size,
    });
  } catch (error) {
    return handleApiError(error, "fetch optional holidays");
  }
}

const toggleSchema = z.object({
  holidayId: z.string().min(1),
  choose: z.boolean(),
});

// POST /api/ess/optional-holidays — the current employee picks or un-picks one Restricted/
// Optional holiday for the year it falls in. Never auto-selects anything; the employee always
// makes this choice explicitly, and it's capped server-side at Company.optionalHolidayQuota.
export async function POST(request: NextRequest) {
  try {
    const { session, employeeId } = await requireOwnEmployeeId(request);
    const body = await request.json();
    const { holidayId, choose } = toggleSchema.parse(body);

    const holiday = await db.holiday.findUnique({ where: { id: holidayId } });
    if (!holiday) {
      return apiError("Holiday not found", 404);
    }
    if (holiday.type !== "optional") {
      return apiError("This holiday is mandatory and cannot be chosen/unchosen.", 400);
    }

    const year = holiday.date.getUTCFullYear();

    if (!choose) {
      await db.optionalHolidayPick.deleteMany({ where: { employeeId, holidayId } });
      await logAudit({ session, action: "delete", entity: "OptionalHolidayPick", entityId: holidayId, details: { employeeId, self: true } });
      return NextResponse.json({ success: true });
    }

    const existing = await db.optionalHolidayPick.findUnique({
      where: { employeeId_holidayId: { employeeId, holidayId } },
    });
    if (existing) {
      return NextResponse.json({ success: true });
    }

    const companyId = await getDefaultCompanyId();
    const company = await db.company.findUnique({ where: { id: companyId } });
    const quota = company?.optionalHolidayQuota ?? 0;

    const currentCount = await db.optionalHolidayPick.count({ where: { employeeId, year } });
    if (currentCount >= quota) {
      return apiError(`You can choose at most ${quota} restricted holiday(s) for this year.`, 409);
    }

    const pick = await db.optionalHolidayPick.create({ data: { employeeId, holidayId, year } });
    await logAudit({ session, action: "create", entity: "OptionalHolidayPick", entityId: pick.id, details: { employeeId, holidayId, self: true } });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "choose optional holiday");
  }
}
