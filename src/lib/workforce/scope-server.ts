import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth";
import { assignmentScopeWhere, isFullAccess, moduleEnabledFor } from "@/lib/workforce/access";

type Caller = Pick<SessionPayload, "role" | "userId" | "employeeId">;

const assignmentInclude = {
  project: { include: { client: true } },
  employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true, phone: true, employmentType: true } },
  clientRep: true,
} satisfies Prisma.AssignmentInclude;

export type AssignmentWithRelations = Prisma.AssignmentGetPayload<{ include: typeof assignmentInclude }>;

/**
 * Assignments the caller may see, with the module's feature flag applied for non-admin callers:
 * a coordinator or contractor sees nothing for a client/project the module is switched off for,
 * while admin/hr can always see everything so they can set the module up before enabling it.
 */
export async function visibleAssignments(caller: Caller, extra: Prisma.AssignmentWhereInput = {}): Promise<AssignmentWithRelations[]> {
  const scope = assignmentScopeWhere(caller);
  if (!scope) return [];
  const rows = await db.assignment.findMany({
    where: { AND: [scope, extra] },
    include: assignmentInclude,
    orderBy: [{ status: "asc" }, { startDate: "desc" }],
  });
  if (isFullAccess(caller.role)) return rows;
  const flags = await db.featureFlag.findMany({
    where: { key: "contractor_workforce_enabled" },
    select: { key: true, scopeKey: true, enabled: true },
  });
  return rows.filter((r) => moduleEnabledFor(flags, { clientId: r.project.clientId, projectId: r.projectId }));
}

/** Compensation terms are never shown to coordinators/contractors (same policy as salary figures). */
export function serializeAssignment<T extends { payType: string; payRate: number | null; monthlyDayBasis: string }>(
  row: T,
  caller: Caller
): Omit<T, "payType" | "payRate" | "monthlyDayBasis"> | T {
  if (isFullAccess(caller.role)) return row;
  const { payType: _payType, payRate: _payRate, monthlyDayBasis: _basis, ...rest } = row;
  void _payType; void _payRate; void _basis;
  return rest;
}

/** Ids of the clients and projects a non-admin caller can see (derived from their assignments). */
export async function visibleClientAndProjectIds(caller: Caller): Promise<{ clientIds: Set<string>; projectIds: Set<string> }> {
  const rows = await visibleAssignments(caller);
  return {
    clientIds: new Set(rows.map((r) => r.project.clientId)),
    projectIds: new Set(rows.map((r) => r.projectId)),
  };
}
