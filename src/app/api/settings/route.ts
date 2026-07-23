import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateSettingsSchema } from "@/lib/validations/settings";
import { handleApiError } from "@/lib/api-utils";
import { requireAuth, requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

const DEFAULT_COMPANY = {
  name: "My Company",
  address: "",
  pan: "",
  tan: "",
  gstin: "",
  pfNumber: "",
  esiNumber: "",
  state: "Maharashtra",
  financialYearStart: "2025-04-01",
  payrollMonth: 4,
  payrollYear: 2025,
  weeklyOffDays: [0],
};

function parseWeeklyOffDays(value: string): number[] {
  return value
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n >= 0 && n <= 6);
}

// GET /api/settings — return company settings (first record) or defaults
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const company = await db.company.findFirst();

    if (!company) {
      return NextResponse.json({ data: DEFAULT_COMPANY });
    }

    return NextResponse.json({
      data: { ...company, weeklyOffDays: parseWeeklyOffDays(company.weeklyOffDays) },
    });
  } catch (error) {
    return handleApiError(error, "fetch company settings");
  }
}

// PUT /api/settings — update (or create) company settings
export async function PUT(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin"]);
    const raw = await request.json();
    const body = updateSettingsSchema.parse(raw);
    const weeklyOffDaysStr = body.weeklyOffDays ? [...new Set(body.weeklyOffDays)].sort().join(",") : undefined;

    const existing = await db.company.findFirst();

    let company;

    if (existing) {
      company = await db.company.update({
        where: { id: existing.id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.address !== undefined && { address: body.address }),
          ...(body.pan !== undefined && { pan: body.pan }),
          ...(body.tan !== undefined && { tan: body.tan }),
          ...(body.gstin !== undefined && { gstin: body.gstin }),
          ...(body.pfNumber !== undefined && { pfNumber: body.pfNumber }),
          ...(body.esiNumber !== undefined && { esiNumber: body.esiNumber }),
          ...(body.state !== undefined && { state: body.state }),
          ...(body.financialYearStart !== undefined && {
            financialYearStart: body.financialYearStart,
          }),
          ...(body.payrollMonth !== undefined && { payrollMonth: body.payrollMonth }),
          ...(body.payrollYear !== undefined && { payrollYear: body.payrollYear }),
          ...(weeklyOffDaysStr !== undefined && { weeklyOffDays: weeklyOffDaysStr }),
        },
      });
    } else {
      company = await db.company.create({
        data: {
          name: body.name ?? DEFAULT_COMPANY.name,
          address: body.address ?? null,
          pan: body.pan ?? null,
          tan: body.tan ?? null,
          gstin: body.gstin ?? null,
          pfNumber: body.pfNumber ?? null,
          esiNumber: body.esiNumber ?? null,
          state: body.state ?? DEFAULT_COMPANY.state,
          financialYearStart:
            body.financialYearStart ?? DEFAULT_COMPANY.financialYearStart,
          payrollMonth: body.payrollMonth ?? DEFAULT_COMPANY.payrollMonth,
          payrollYear: body.payrollYear ?? DEFAULT_COMPANY.payrollYear,
          weeklyOffDays: weeklyOffDaysStr ?? DEFAULT_COMPANY.weeklyOffDays.join(","),
        },
      });
    }

    await logAudit({ session, action: "update", entity: "Company", entityId: company.id });

    return NextResponse.json({
      data: { ...company, weeklyOffDays: parseWeeklyOffDays(company.weeklyOffDays) },
    });
  } catch (error) {
    return handleApiError(error, "update company settings");
  }
}
