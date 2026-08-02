import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { upsertInvestmentDeclarationSchema } from "@/lib/validations/investment-declaration";
import { apiError, handleApiError } from "@/lib/api-utils";
import { requireRole, requireSelfOrRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// GET /api/investment-declarations?employeeId=...&year=... — tax-declaration financial data,
// same tier as loans/salary-slip: self or admin/hr only, not manager.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const employeeId = searchParams.get("employeeId");
    const year = searchParams.get("year");

    if (employeeId) {
      await requireSelfOrRole(request, employeeId, ["admin", "hr"]);
    } else {
      await requireRole(request, ["admin", "hr"]);
    }

    const where: Record<string, unknown> = {};
    if (employeeId) where.employeeId = employeeId;
    if (year) where.year = parseInt(year, 10);

    const declarations = await db.investmentDeclaration.findMany({
      where,
      include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
      orderBy: { year: "desc" },
    });

    return NextResponse.json({ data: declarations });
  } catch (error) {
    return handleApiError(error, "fetch investment declarations");
  }
}

// POST /api/investment-declarations — create or update this employee's declaration for the year
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const body = await request.json();
    const parsed = upsertInvestmentDeclarationSchema.parse(body);

    const employee = await db.employee.findUnique({ where: { id: parsed.employeeId } });
    if (!employee) {
      return apiError("Employee not found.", 404);
    }

    const declaration = await db.investmentDeclaration.upsert({
      where: { employeeId_year: { employeeId: parsed.employeeId, year: parsed.year } },
      create: parsed,
      update: { section80C: parsed.section80C, section80D: parsed.section80D, status: parsed.status },
      include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
    });

    await logAudit({
      session,
      action: "update",
      entity: "InvestmentDeclaration",
      entityId: declaration.id,
      details: { employeeId: parsed.employeeId, year: parsed.year, section80C: parsed.section80C, section80D: parsed.section80D, status: parsed.status },
    });

    return NextResponse.json(declaration, { status: 201 });
  } catch (error) {
    return handleApiError(error, "save investment declaration");
  }
}
