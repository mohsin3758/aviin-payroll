import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { AuthError, requireAuth, requireRole, type Role, type SessionPayload } from "@/lib/auth";

// The exhaustive list of gate-able Payroll actions. This list IS the enforcement mechanism for
// "can never grant more than the hr role's existing baseline" — every value here already maps to
// a route hr can reach today; there is deliberately no entry for anything admin-only, so a
// restriction row can never leak extra privilege.
export const PAYROLL_FEATURES = [
  "process_payroll", // POST /api/payroll, PUT /api/payroll/[runId], POST off-cycle, POST alternate-pay
  "view_payroll", // GET /api/payroll, GET /api/payroll/[runId], GET /api/salary-slip, salary-revisions
  "download_bank_file", // GET /api/payroll/[runId]/bank-file
  "manage_arrears", // GET/POST /api/arrears
  "manage_loans", // GET/POST /api/loans
  "send_payslips", // POST /api/salary-slip/send, POST /api/salary-slip/send-bulk
  "manage_form16", // GET /api/form16, POST /api/form16/send-bulk
  "view_reports", // GET /api/reports, GET /api/reports/trends
  "manage_hiring_incentives", // GET/POST /api/hiring-incentives, PUT [id] — payroll-adjacent, feeds a real run
  "view_employees", // GET /api/employees, GET /api/employees/[id]
  "create_employee", // POST /api/employees — scope-exempt, no existing target
  "edit_employee", // PUT/DELETE /api/employees/[id], activate-portal, face-enrollment, shift
  "manage_employee_assets", // /api/employees/[id]/assets, /assets/[assetId]
  "manage_onboarding", // /api/onboarding-invites/*, /api/onboarding/tasks/*, letters
  "view_assets", // GET /api/assets (company-wide inventory)
  "manage_exit_management", // /api/exit-requests/* except manager-approve
  "manage_leave_management", // /api/leaves/* (hr branch), leave-types, leave-balances, encashment
] as const;
export type PayrollFeature = (typeof PAYROLL_FEATURES)[number];

export interface PayrollRestriction {
  features: Set<PayrollFeature> | null; // null = unrestricted
  employeeIds: Set<string> | null; // null = unrestricted
}

const UNRESTRICTED: PayrollRestriction = { features: null, employeeIds: null };

/**
 * Only "hr" is ever narrowable — every other role is always unrestricted by this mechanism
 * regardless of what rows might exist (defense in depth alongside the write-side guard on
 * PUT /api/users/[id]/payroll-access, which only ever writes rows for hr users).
 */
export async function getPayrollRestriction(session: SessionPayload): Promise<PayrollRestriction> {
  if (session.role !== "hr") return UNRESTRICTED;

  const [featureRows, employeeRows] = await Promise.all([
    db.userPayrollFeature.findMany({ where: { userId: session.userId }, select: { feature: true } }),
    db.userPayrollEmployeeScope.findMany({ where: { userId: session.userId }, select: { employeeId: true } }),
  ]);

  return {
    features: featureRows.length > 0 ? new Set(featureRows.map((r) => r.feature as PayrollFeature)) : null,
    employeeIds: employeeRows.length > 0 ? new Set(employeeRows.map((r) => r.employeeId)) : null,
  };
}

export function hasFeature(restriction: PayrollRestriction, feature: PayrollFeature): boolean {
  return restriction.features === null || restriction.features.has(feature);
}

export function inEmployeeScope(restriction: PayrollRestriction, employeeId: string): boolean {
  return restriction.employeeIds === null || restriction.employeeIds.has(employeeId);
}

/** Throws 403 if the target employee is outside restriction.employeeIds. No-op when unrestricted. */
export function assertEmployeeInScope(restriction: PayrollRestriction, employeeId: string): void {
  if (!inEmployeeScope(restriction, employeeId)) {
    throw new AuthError("Forbidden — you don't have payroll access to this employee.", 403);
  }
}

/** Filters an array of { employeeId } rows down to the caller's scope. Identity when unrestricted. */
export function filterToScope<T extends { employeeId: string }>(restriction: PayrollRestriction, rows: T[]): T[] {
  if (restriction.employeeIds === null) return rows;
  const ids = restriction.employeeIds;
  return rows.filter((r) => ids.has(r.employeeId));
}

/** Same as filterToScope, but for rows that are themselves the employee (keyed by .id, not
 * .employeeId) — e.g. the Employees list route's own rows. */
export function filterEmployeesToScope<T extends { id: string }>(restriction: PayrollRestriction, rows: T[]): T[] {
  if (restriction.employeeIds === null) return rows;
  const ids = restriction.employeeIds;
  return rows.filter((r) => ids.has(r.id));
}

/**
 * Collection/action endpoints (GET /api/payroll, POST /api/arrears, etc). Preserves the existing
 * role ceiling via requireRole, then — only for "hr" — enforces the feature gate. Returns the
 * restriction so the caller can also apply employee-scope filtering/assertion where meaningful.
 */
export async function requirePayrollFeature(
  request: NextRequest,
  allowedRoles: Role[],
  feature: PayrollFeature
): Promise<{ session: SessionPayload; restriction: PayrollRestriction }> {
  const session = await requireRole(request, allowedRoles);
  const restriction = await getPayrollRestriction(session);
  if (!hasFeature(restriction, feature)) {
    throw new AuthError(`Forbidden — your payroll access doesn't include: ${feature}.`, 403);
  }
  return { session, restriction };
}

/**
 * Single-target endpoints (GET /api/salary-slip?employeeId=..., GET /api/form16?employeeId=...).
 * Mirrors requireSelfOrRole's shape: self access is completely untouched by this mechanism (an
 * employee viewing their own slip was never gated by hr's feature/employee restrictions and
 * still isn't); elevated-role access additionally requires the feature AND — for hr — the target
 * employeeId to be in scope.
 */
export async function requirePayrollSelfOrFeature(
  request: NextRequest,
  targetEmployeeId: string,
  elevatedRoles: Role[],
  feature: PayrollFeature
): Promise<{ session: SessionPayload; restriction: PayrollRestriction }> {
  const session = await requireAuth(request);
  if (elevatedRoles.includes(session.role)) {
    const restriction = await getPayrollRestriction(session);
    if (!hasFeature(restriction, feature)) {
      throw new AuthError(`Forbidden — your payroll access doesn't include: ${feature}.`, 403);
    }
    assertEmployeeInScope(restriction, targetEmployeeId);
    return { session, restriction };
  }
  if (session.employeeId && session.employeeId === targetEmployeeId) {
    return { session, restriction: UNRESTRICTED };
  }
  throw new AuthError("Forbidden — you may only access or act on your own record.", 403);
}
