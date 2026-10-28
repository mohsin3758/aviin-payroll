import { db } from "@/lib/db";
import { computePayPrefill, type MonthlyDayBasis, type PayType } from "@/lib/workforce/pay-prefill";
import type { AssignmentMonth } from "@/lib/workforce/month";

/**
 * From locked months to payroll-ready entries. Nothing here moves money: it turns admin-approved
 * suggestions into `{employeeId, unitsWorked, rateOverride}` rows in exactly the shape the
 * EXISTING Alternate Pay run accepts, and lists everything that is still blocked and why.
 */
export interface PrefillDetail {
  unitsWorked: number;
  rateOverride: number;
  suggestedGross: number;
  basisNote: string;
  inputs: { payType: PayType; payRate: number; monthlyDayBasis: MonthlyDayBasis; year: number; month: number; workingDaysInMonth: number; outsideUnpaidDays: number; unpaidDays: number };
  withoutDeduction: { unitsWorked: number; rateOverride: number; suggestedGross: number } | null;
}

export interface DeductionDetail {
  unpaidDays: number;
  amountReduction: number;
  modifiedUnpaidDays?: number;
}

export interface PayrollEntry {
  employeeId: string;
  employeeCode: string;
  name: string;
  assignmentId: string;
  unitsWorked: number;
  rateOverride: number;
  suggestedGross: number;
  note: string;
}

/** Problems that must stop an entry from reaching payroll (spec §12). Returns [] when it is clean. */
export async function payrollProblems(a: Pick<AssignmentMonth, "employeeId" | "contractor" | "blockingExceptions" | "openDisputes" | "undecidedDays">, year: number, month: number): Promise<string[]> {
  const problems: string[] = [];
  const employee = await db.employee.findUnique({ where: { id: a.employeeId }, select: { dateOfExit: true, employmentType: true } });
  if (!employee) problems.push("Contractor record not found.");
  else if (employee.employmentType === "permanent") problems.push("This person is a permanent employee: they belong in the regular payroll run.");
  if (a.blockingExceptions > 0) problems.push(`${a.blockingExceptions} unresolved exception(s) of severity 3+.`);
  if (a.openDisputes > 0) problems.push(`${a.openDisputes} open dispute(s).`);
  if (a.undecidedDays > 0) problems.push(`${a.undecidedDays} undecided day(s).`);
  const dup = await db.payrollDetail.findFirst({
    where: { employeeId: a.employeeId, payrollRun: { month, year, runType: "alternate_pay" } },
    select: { id: true },
  });
  if (dup) problems.push("Already paid for this month in an alternate-pay run (duplicate payroll entry).");
  return problems;
}

export async function computeEntries(year: number, month: number, projectId?: string) {
  const suggestions = await db.suggestion.findMany({
    where: { year, month, kind: { in: ["prefill", "deduction", "payroll_blocker"] } },
  });
  const byAssignment = new Map<string, typeof suggestions>();
  for (const s of suggestions) byAssignment.set(s.assignmentId, [...(byAssignment.get(s.assignmentId) ?? []), s]);

  const assignments = await db.assignment.findMany({
    where: { id: { in: [...byAssignment.keys()] }, ...(projectId ? { projectId } : {}) },
    include: { employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } } },
  });

  const entries: PayrollEntry[] = [];
  const blocked: { assignmentId: string; name: string; reasons: string[] }[] = [];

  for (const a of assignments) {
    const name = `${a.employee.firstName} ${a.employee.lastName ?? ""}`.trim();
    const rows = byAssignment.get(a.id) ?? [];
    const prefill = rows.find((r) => r.kind === "prefill");
    const deduction = rows.find((r) => r.kind === "deduction");
    const blocker = rows.find((r) => r.kind === "payroll_blocker");
    const reasons: string[] = [];

    if (blocker && blocker.status !== "rejected") reasons.push(...(JSON.parse(blocker.detail).problems ?? ["Payroll blocker."]));
    if (!prefill) reasons.push("No pay suggestion was generated.");
    else if (prefill.status === "pending_admin") reasons.push("Pay suggestion is awaiting admin approval.");
    else if (prefill.status === "rejected") reasons.push(`Pay suggestion was rejected: ${prefill.decidedReason ?? "no reason recorded"}.`);
    if (deduction?.status === "pending_admin") reasons.push("Absence deduction is awaiting admin approval.");

    if (reasons.length > 0 || !prefill) { blocked.push({ assignmentId: a.id, name, reasons }); continue; }

    const d = JSON.parse(prefill.detail) as PrefillDetail & { override?: { unitsWorked: number; rateOverride: number } };
    let units = d.unitsWorked, rate = d.rateOverride, gross = d.suggestedGross, note = d.basisNote;

    if (prefill.status === "modified" && d.override) {
      units = d.override.unitsWorked; rate = d.override.rateOverride; gross = Math.round(units * rate); note = `Admin-modified: ${prefill.decidedReason ?? ""}`;
    } else if (deduction?.status === "rejected" && d.withoutDeduction) {
      ({ unitsWorked: units, rateOverride: rate, suggestedGross: gross } = d.withoutDeduction);
      note = `${d.basisNote}; absence deduction rejected by admin`;
    } else if (deduction?.status === "modified") {
      const dd = JSON.parse(deduction.detail) as DeductionDetail;
      const recomputed = computePayPrefill({
        payType: d.inputs.payType, payRate: d.inputs.payRate, monthlyDayBasis: d.inputs.monthlyDayBasis, year: d.inputs.year, month: d.inputs.month,
        workingDaysInMonth: d.inputs.workingDaysInMonth, unpaidDays: (dd.modifiedUnpaidDays ?? d.inputs.unpaidDays) + d.inputs.outsideUnpaidDays,
      });
      if (!recomputed.ok) { blocked.push({ assignmentId: a.id, name, reasons: [recomputed.reason] }); continue; }
      units = recomputed.unitsWorked; rate = recomputed.rateOverride; gross = recomputed.suggestedGross; note = `${recomputed.basisNote}; deduction modified by admin`;
    }
    entries.push({ employeeId: a.employeeId, employeeCode: a.employee.employeeCode, name, assignmentId: a.id, unitsWorked: units, rateOverride: rate, suggestedGross: gross, note });
  }
  return { entries, blocked };
}

/** Compares approved entries with what the existing alternate-pay run actually recorded; any gap is a mismatch to review. */
export async function reconcile(year: number, month: number, entries: PayrollEntry[]) {
  const details = await db.payrollDetail.findMany({
    where: { employeeId: { in: entries.map((e) => e.employeeId) }, payrollRun: { month, year, runType: "alternate_pay" } },
    select: { employeeId: true, paidDays: true, grossSalary: true },
  });
  const byEmp = new Map(details.map((d) => [d.employeeId, d]));
  return entries.map((e) => {
    const d = byEmp.get(e.employeeId);
    if (!d) return { employeeId: e.employeeCode, name: e.name, status: "not_yet_paid" as const, expected: e.suggestedGross, actual: null };
    return {
      employeeId: e.employeeCode, name: e.name, expected: e.suggestedGross, actual: d.grossSalary,
      status: Math.abs(d.grossSalary - e.suggestedGross) <= 1 ? ("matched" as const) : ("mismatch" as const),
    };
  });
}
