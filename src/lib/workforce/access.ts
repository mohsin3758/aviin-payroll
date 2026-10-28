import type { Prisma } from "@prisma/client";
import type { SessionPayload } from "@/lib/auth";
import { resolveFlag, type FlagRow } from "@/lib/workforce/flags";

/**
 * Access scoping for the Contractor Workforce module.
 *
 * Deliberately NO new roles in Phase 1: roughly a dozen existing routes only restrict the
 * "employee" role (documents, helpdesk, exit requests, ...), so a new role value would silently
 * get elevated access there. Instead:
 *   admin / hr  -> full access to everything in this module
 *   manager     -> a "coordinator": sees only what they are assigned to (resource coordinator,
 *                  client coordinator or KAM on an Assignment); read-only here
 *   employee    -> a contractor: sees only their own assignments
 */

export interface AssignmentScopeRow {
  employeeId: string;
  resourceCoordinatorId: string | null;
  clientCoordinatorId: string | null;
  kamId: string | null;
}

export function isFullAccess(role: SessionPayload["role"]): boolean {
  return role === "admin" || role === "hr";
}

export function isCoordinatorOn(userId: string, row: AssignmentScopeRow): boolean {
  return row.resourceCoordinatorId === userId || row.clientCoordinatorId === userId || row.kamId === userId;
}

/** Pure check used by single-record routes and by the tests. */
export function canSeeAssignment(session: Pick<SessionPayload, "role" | "userId" | "employeeId">, row: AssignmentScopeRow): boolean {
  if (isFullAccess(session.role)) return true;
  if (session.role === "manager") return isCoordinatorOn(session.userId, row);
  if (session.role === "employee") return session.employeeId != null && session.employeeId === row.employeeId;
  return false;
}

/**
 * Prisma `where` restricting Assignment queries to what the caller may see. Returns `null` when
 * the caller can see nothing at all (e.g. an employee login not linked to an Employee record).
 */
export function assignmentScopeWhere(
  session: Pick<SessionPayload, "role" | "userId" | "employeeId">
): Prisma.AssignmentWhereInput | null {
  if (isFullAccess(session.role)) return {};
  if (session.role === "manager") {
    return {
      OR: [
        { resourceCoordinatorId: session.userId },
        { clientCoordinatorId: session.userId },
        { kamId: session.userId },
      ],
    };
  }
  if (session.role === "employee" && session.employeeId) return { employeeId: session.employeeId };
  return null;
}

/** Whether the module is switched on for a client/project, given pre-loaded flag rows. */
export function moduleEnabledFor(rows: FlagRow[], ctx: { clientId: string; projectId: string }): boolean {
  return resolveFlag(rows, "contractor_workforce_enabled", ctx);
}
