import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOwnEmployeeId } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

const ownDeclarationSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  section80C: z.coerce.number().min(0).max(1000000),
  section80D: z.coerce.number().min(0).max(1000000),
});

// GET /api/ess/investment-declaration?year= — the current user's own declaration for a year.
export async function GET(request: NextRequest) {
  try {
    const { employeeId } = await requireOwnEmployeeId(request);
    const { searchParams } = request.nextUrl;
    const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()), 10);

    const declaration = await db.investmentDeclaration.findUnique({
      where: { employeeId_year: { employeeId, year } },
    });

    return NextResponse.json({ data: declaration });
  } catch (error) {
    return handleApiError(error, "fetch own investment declaration");
  }
}

// POST /api/ess/investment-declaration — self-declare 80C/80D for a financial year.
// Always resets status back to "declared" (unverified) — HR re-verifies via the admin route
// whenever the declared figures actually change, rather than trusting a stale verification.
export async function POST(request: NextRequest) {
  try {
    const { session, employeeId } = await requireOwnEmployeeId(request);
    const body = await request.json();
    const parsed = ownDeclarationSchema.parse(body);

    const existing = await db.investmentDeclaration.findUnique({
      where: { employeeId_year: { employeeId, year: parsed.year } },
    });
    if (existing?.status === "verified") {
      return apiError("This year's declaration has already been verified by HR and can no longer be self-edited. Contact HR for changes.", 409);
    }

    const declaration = await db.investmentDeclaration.upsert({
      where: { employeeId_year: { employeeId, year: parsed.year } },
      create: { employeeId, year: parsed.year, section80C: parsed.section80C, section80D: parsed.section80D },
      update: { section80C: parsed.section80C, section80D: parsed.section80D, status: "declared" },
    });

    await logAudit({ session, action: "update", entity: "InvestmentDeclaration", entityId: declaration.id, details: { self: true, year: parsed.year } });

    return NextResponse.json({ data: declaration }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "save own investment declaration");
  }
}
