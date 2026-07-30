import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createCandidateSchema } from "@/lib/validations/candidate";
import { getDefaultCompanyId, handleApiError } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { computeBillingAmount } from "@/lib/candidate-billing";

const RECRUITER_SUMMARY = { select: { firstName: true, lastName: true, employeeCode: true } } as const;
const BILLING_FIELDS = ["billingType", "billingValue", "paymentReceived"] as const;

function withBillingAmount<T extends { billingType: string | null; billingValue: number | null; annualSalary: number | null }>(
  candidate: T
) {
  return { ...candidate, billingAmount: computeBillingAmount(candidate) };
}

// Client billing (fee/percentage/payment-received) is admin-only — hr can manage every other
// candidate field but never sees or sets billing figures. Enforced here, not just hidden in the
// UI, so a raw API call can't bypass it either.
function redactBillingIfNotAdmin<T extends { billingType?: unknown; billingValue?: unknown; billingAmount?: unknown; paymentReceived?: unknown }>(
  candidate: T,
  isAdmin: boolean
): T {
  if (isAdmin) return candidate;
  const redacted = { ...candidate };
  delete redacted.billingType;
  delete redacted.billingValue;
  delete redacted.billingAmount;
  delete redacted.paymentReceived;
  return redacted;
}

function stripBillingFields<T extends Record<string, unknown>>(data: T): T {
  const stripped = { ...data };
  for (const field of BILLING_FIELDS) {
    delete stripped[field];
  }
  return stripped;
}

// GET /api/candidates?status=active|ended — admin/hr only. Externally-placed contract/full-time
// candidates, tracked separately from in-house payroll Employees (no PF/ESI/bank/tax fields).
export async function GET(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const isAdmin = session.role === "admin";
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

    const data = candidates.map((c) => redactBillingIfNotAdmin(withBillingAmount(c), isAdmin));
    return NextResponse.json({ data });
  } catch (error) {
    return handleApiError(error, "fetch candidates");
  }
}

// POST /api/candidates — admin/hr only. Billing fields are silently dropped (not errored) for
// hr, since the hr-facing form never sends them in the first place.
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const isAdmin = session.role === "admin";
    const body = await request.json();
    const parsed = createCandidateSchema.parse(body);
    const data = isAdmin ? parsed : stripBillingFields(parsed);

    const companyId = await getDefaultCompanyId();
    const candidate = await db.candidate.create({
      data: { ...data, companyId },
      include: { recruiter: RECRUITER_SUMMARY },
    });

    await logAudit({
      session,
      action: "create",
      entity: "Candidate",
      entityId: candidate.id,
      details: { firstName: parsed.firstName, lastName: parsed.lastName, client: parsed.client },
    });

    return NextResponse.json(redactBillingIfNotAdmin(withBillingAmount(candidate), isAdmin), { status: 201 });
  } catch (error) {
    return handleApiError(error, "create candidate");
  }
}
