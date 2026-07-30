import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createCandidateSchema } from "@/lib/validations/candidate";
import { getDefaultCompanyId, handleApiError } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// GET /api/candidates?status=active|ended — admin/hr only. Externally-placed contract/full-time
// candidates, tracked separately from in-house payroll Employees (no PF/ESI/bank/tax fields).
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ["admin", "hr"]);
    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (status === "active") where.dateOfExit = null;
    if (status === "ended") where.dateOfExit = { not: null };

    const candidates = await db.candidate.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: candidates });
  } catch (error) {
    return handleApiError(error, "fetch candidates");
  }
}

// POST /api/candidates — admin/hr only.
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const body = await request.json();
    const parsed = createCandidateSchema.parse(body);

    const companyId = await getDefaultCompanyId();
    const candidate = await db.candidate.create({
      data: { ...parsed, companyId },
    });

    await logAudit({
      session,
      action: "create",
      entity: "Candidate",
      entityId: candidate.id,
      details: { firstName: parsed.firstName, lastName: parsed.lastName, client: parsed.client },
    });

    return NextResponse.json(candidate, { status: 201 });
  } catch (error) {
    return handleApiError(error, "create candidate");
  }
}
