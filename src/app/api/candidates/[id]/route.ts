import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateCandidateSchema } from "@/lib/validations/candidate";
import { apiError, handleApiError } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { computeBillingAmount } from "@/lib/candidate-billing";
import { refreshPendingHiringIncentiveVesting } from "@/lib/payroll/hiring-incentive";

const RECRUITER_SUMMARY = { select: { firstName: true, lastName: true, employeeCode: true } } as const;
const HIRING_INCENTIVE_SUMMARY = {
  select: { id: true, status: true, amount: true, payMonth: true, payYear: true },
} as const;
const BILLING_FIELDS = ["billingType", "billingValue", "paymentReceived"] as const;
// Fields worth a specific before/after audit entry — money-relevant, the kind of thing someone
// would need to answer "who changed this and when" about later. Everything else on Candidate
// just gets a generic "updated" log entry.
const AUDITED_FIELDS = ["billingType", "billingValue", "paymentReceived", "monthlySalary", "annualSalary"] as const;

type Params = { params: Promise<{ id: string }> };

function stripBillingFields<T extends Record<string, unknown>>(data: T): T {
  const stripped = { ...data };
  for (const field of BILLING_FIELDS) {
    delete stripped[field];
  }
  return stripped;
}

function diffAuditedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of AUDITED_FIELDS) {
    if (field in after && after[field] !== before[field]) {
      changes[field] = { from: before[field], to: after[field] };
    }
  }
  return changes;
}

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

// PUT /api/candidates/[id] — admin/hr only. Typically used to record an end date (contract
// ended / placement over) or correct details. Client billing is admin-only (both writing and
// reading it) — an hr session's request silently has billing fields dropped, never applied.
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const isAdmin = session.role === "admin";
    const { id } = await params;

    const existing = await db.candidate.findUnique({ where: { id } });
    if (!existing) {
      return apiError("Candidate not found", 404);
    }

    const body = await request.json();
    const parsed = updateCandidateSchema.parse(body);
    const data = isAdmin ? parsed : stripBillingFields(parsed);

    const auditedChanges = diffAuditedFields(existing, data);

    await db.candidate.update({ where: { id }, data });

    // Recording an end date (or any other edit) can change whether this candidate's pending
    // incentive should now be forfeited — re-evaluate before building the response, so a
    // placement-end action is reflected immediately rather than waiting for some other screen
    // to happen to refresh it first.
    await refreshPendingHiringIncentiveVesting();

    const candidate = await db.candidate.findUniqueOrThrow({
      where: { id },
      include: { recruiter: RECRUITER_SUMMARY, hiringIncentive: HIRING_INCENTIVE_SUMMARY },
    });

    await logAudit({
      session,
      action: "update",
      entity: "Candidate",
      entityId: id,
      details: Object.keys(auditedChanges).length > 0 ? auditedChanges : undefined,
    });

    const withBilling = { ...candidate, billingAmount: computeBillingAmount(candidate) };
    return NextResponse.json(redactBillingIfNotAdmin(withBilling, isAdmin));
  } catch (error) {
    return handleApiError(error, "update candidate");
  }
}

// DELETE /api/candidates/[id] — admin/hr only. Blocked if a hiring incentive already references
// this candidate (delete/cancel that first) — never silently orphan a real incentive record.
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id } = await params;

    const existing = await db.candidate.findUnique({ where: { id }, include: { hiringIncentive: true } });
    if (!existing) {
      return apiError("Candidate not found", 404);
    }
    if (existing.hiringIncentive) {
      return apiError("This candidate has a hiring incentive on record and cannot be deleted. Cancel the incentive first if needed.", 400);
    }

    await db.candidate.delete({ where: { id } });

    await logAudit({ session, action: "delete", entity: "Candidate", entityId: id });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "delete candidate");
  }
}
