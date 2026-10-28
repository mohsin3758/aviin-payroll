import { db } from "@/lib/db";
import { AuthError, type SessionPayload } from "@/lib/auth";
import { canSeeAssignment } from "@/lib/workforce/access";
import { WorkforceError } from "@/lib/workforce/daily";
import { TokenError } from "@/lib/workforce/tokens";
import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-utils";

/** Throws 404 (never 403, so ids don't leak) unless the caller may see this assignment. */
export async function assertAssignmentAccess(session: SessionPayload, assignmentId: string) {
  const row = await db.assignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, employeeId: true, resourceCoordinatorId: true, clientCoordinatorId: true, kamId: true, projectId: true, project: { select: { clientId: true } } },
  });
  if (!row || !canSeeAssignment(session, row)) throw new AuthError("Not found", 404);
  return row;
}

/** Maps workforce-specific errors to responses; everything else falls through to the shared handler. */
export function workforceError(error: unknown, context: string): NextResponse {
  if (error instanceof WorkforceError || error instanceof TokenError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return handleApiError(error, context);
}

export function parseDay(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return isNaN(d.getTime()) ? null : d;
}
