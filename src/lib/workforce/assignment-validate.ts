import { db } from "@/lib/db";
import { findExclusivityConflicts, activationProblems, type ExistingAssignmentLite } from "@/lib/workforce/assignment-rules";

/** Staff roles that may act as a coordinator/KAM. Contractors ("employee" logins) may not. */
const STAFF_ROLES = ["admin", "hr", "manager"];

export interface AssignmentCandidate {
  id?: string;
  employeeId: string;
  projectId: string;
  clientRepContactId: string | null;
  coordinatorUserIds: (string | null)[];
  startDate: Date;
  endDate: Date | null;
  contractType: string;
  status: string;
  payRate: number | null;
}

/** Returns a list of human-readable problems (empty = valid). */
export async function validateAssignment(a: AssignmentCandidate): Promise<{ status: 400 | 404 | 409; problems: string[] } | null> {
  const employee = await db.employee.findUnique({ where: { id: a.employeeId }, select: { id: true, dateOfExit: true } });
  if (!employee) return { status: 404, problems: ["Employee not found."] };
  if (employee.dateOfExit) return { status: 400, problems: ["That employee has exited and cannot be assigned."] };

  const project = await db.project.findUnique({ where: { id: a.projectId }, include: { client: true } });
  if (!project) return { status: 404, problems: ["Project not found."] };
  if (!project.active || !project.client.active) return { status: 400, problems: ["The project or its client is inactive."] };

  if (a.clientRepContactId) {
    const contact = await db.clientContact.findUnique({ where: { id: a.clientRepContactId } });
    if (!contact || contact.clientId !== project.clientId || !contact.active) {
      return { status: 400, problems: ["The client contact must be an active contact of the same client as the project."] };
    }
  }

  const userIds = [...new Set(a.coordinatorUserIds.filter((id): id is string => !!id))];
  if (userIds.length > 0) {
    const users = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, role: true, active: true } });
    const bad = userIds.filter((id) => {
      const u = users.find((x) => x.id === id);
      return !u || !u.active || !STAFF_ROLES.includes(u.role);
    });
    if (bad.length > 0) {
      return { status: 400, problems: ["Coordinators and KAMs must be active staff logins (admin, hr or manager), not contractor logins."] };
    }
  }

  const problems = activationProblems({ status: a.status, payRate: a.payRate });
  if (problems.length > 0) return { status: 400, problems };

  const others = await db.assignment.findMany({
    where: { employeeId: a.employeeId, status: { not: "ended" } },
    select: { id: true, status: true, contractType: true, startDate: true, endDate: true },
  });
  const existing: ExistingAssignmentLite[] = others.map((o) => ({
    id: o.id, status: o.status, contractType: o.contractType, start: o.startDate, end: o.endDate,
  }));
  const conflicts = findExclusivityConflicts({ id: a.id, contractType: a.contractType, start: a.startDate, end: a.endDate }, existing);
  if (conflicts.length > 0) {
    return {
      status: 409,
      problems: ["This contractor already has an overlapping assignment and at least one of the two is exclusive. End or adjust the other assignment first, or make both non-exclusive."],
    };
  }
  return null;
}
