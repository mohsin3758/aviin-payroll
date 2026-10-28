export interface DateRange {
  start: Date;
  end: Date | null; // null = open-ended
}

export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  const aEnd = a.end ? a.end.getTime() : Infinity;
  const bEnd = b.end ? b.end.getTime() : Infinity;
  return a.start.getTime() <= bEnd && b.start.getTime() <= aEnd;
}

export interface ExistingAssignmentLite extends DateRange {
  id: string;
  status: string;
  contractType: string;
}

/**
 * Other, not-yet-ended assignments of the same contractor that overlap the given one in time
 * where at least one side is exclusive. These are surfaced to the admin as a conflict — a
 * schedule/contract clash to resolve — not as any accusation about the contractor.
 */
export function findExclusivityConflicts(
  candidate: DateRange & { id?: string; contractType: string },
  existing: ExistingAssignmentLite[]
): ExistingAssignmentLite[] {
  return existing.filter((e) => {
    if (e.id === candidate.id) return false;
    if (e.status === "ended") return false;
    if (!rangesOverlap(candidate, e)) return false;
    return candidate.contractType === "exclusive" || e.contractType === "exclusive";
  });
}

/** An assignment can only go live once its pay terms exist, so payroll pre-fill never meets a hole. */
export function activationProblems(a: { status: string; payRate: number | null }): string[] {
  const problems: string[] = [];
  if (a.status === "active" && !(a.payRate != null && a.payRate > 0)) {
    problems.push("A pay rate is required before an assignment can be set to active.");
  }
  return problems;
}
