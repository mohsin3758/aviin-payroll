import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createCandidateSchema } from "@/lib/validations/candidate";
import { getDefaultCompanyId, handleApiError } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { computeBillingAmount } from "@/lib/candidate-billing";

const RECRUITER_SUMMARY = { select: { firstName: true, lastName: true, employeeCode: true } } as const;

function withBillingAmount<T extends { billingType: string | null; billingValue: number | null; annualSalary: number | null }>(
  candidate: T
) {
  return { ...candidate, billingAmount: computeBillingAmount(candidate) };
}

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
      include: { recruiter: RECRUITER_SUMMARY },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: candidates.map(withBillingAmount) });
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
      include: { recruiter: RECRUITER_SUMMARY },
    });

    await logAudit({
      session,
      action: "create",
      entity: "Candidate",
      entityId: candidate.id,
      details: { firstName: parsed.firstName, lastName: parsed.lastName, client: parsed.client },
    });

    return NextResponse.json(withBillingAmount(candidate), { status: 201 });
  } catch (error) {
    return handleApiError(error, "create candidate");
  }
}
