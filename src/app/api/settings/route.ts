import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

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
};

// GET /api/settings — return company settings (first record) or defaults
export async function GET() {
  try {
    const company = await db.company.findFirst();

    if (!company) {
      return NextResponse.json({ data: DEFAULT_COMPANY });
    }

    return NextResponse.json({ data: company });
  } catch (error) {
    console.error("[SETTINGS_GET]", error);
    return NextResponse.json(
      { error: "Failed to fetch company settings" },
      { status: 500 }
    );
  }
}

// PUT /api/settings — update (or create) company settings
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

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
        },
      });
    }

    return NextResponse.json({ data: company });
  } catch (error) {
    console.error("[SETTINGS_PUT]", error);
    return NextResponse.json(
      { error: "Failed to update company settings" },
      { status: 500 }
    );
  }
}