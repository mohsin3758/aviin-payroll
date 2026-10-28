import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { buildProjectMonth, monthRange, attendanceStatusFor } from "@/lib/workforce/month";
import { payrollProblems, type PrefillDetail, type DeductionDetail } from "@/lib/workforce/finalize";
import { workforceError } from "@/lib/workforce/route-helpers";
import type { DayResult } from "@/lib/workforce/attendance-rules";

const schema = z.object({
  projectId: z.string().min(1),
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  // Normally the client's sign-off is required first. An admin can proceed without it, but must say why.
  waiveSignOffReason: z.string().trim().min(5).max(500).optional(),
});

// POST /api/workforce/month/lock — admin/hr. Locks a project's month: freezes every day, writes the
// existing Attendance records, and creates payroll SUGGESTIONS (pay entry, absence deduction, or a
// blocker). It never calls payroll; an admin must still approve each suggestion and submit.
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const body = schema.parse(await request.json());
    const { start, end } = monthRange(body.year, body.month);

    const existing = await db.monthLock.findUnique({ where: { projectId_year_month: { projectId: body.projectId, year: body.year, month: body.month } } });
    if (existing) return apiError("This month is already locked.", 409);

    const report = await buildProjectMonth(body.projectId, body.year, body.month);
    if (!report.ready) return NextResponse.json({ error: "This month cannot be locked yet.", blockers: report.blockers }, { status: 409 });

    const signed = report.signOff?.status === "signed";
    if (!signed) {
      if (session.role !== "admin" || !body.waiveSignOffReason) {
        return apiError("The client has not signed off this month. Get their sign-off, or an admin can waive it with a written reason.", 409);
      }
    }

    const days = await db.dailyStatus.findMany({
      where: { date: { gte: start, lt: end }, assignment: { projectId: body.projectId } },
      include: { assignment: { select: { employeeId: true } } },
    });

    await db.$transaction(async (tx) => {
      await tx.monthLock.create({ data: { projectId: body.projectId, year: body.year, month: body.month, lockedBy: session.userId } });
      for (const d of days) {
        const ev = d.evaluation ? (JSON.parse(d.evaluation) as DayResult) : null;
        const attendance = await tx.attendance.upsert({
          where: { employeeId_date: { employeeId: d.assignment.employeeId, date: d.date } },
          create: {
            employeeId: d.assignment.employeeId, date: d.date, punchIn: d.checkInAt, punchOut: d.checkOutAt, punchInMethod: "manual", punchOutMethod: d.checkOutAt ? "manual" : null,
            status: attendanceStatusFor(d.state, ev?.unpaidFraction ?? 0), totalHours: d.hoursWorked, notes: "Contractor Workforce (month locked)",
          },
          update: {
            punchIn: d.checkInAt, punchOut: d.checkOutAt, status: attendanceStatusFor(d.state, ev?.unpaidFraction ?? 0), totalHours: d.hoursWorked,
            notes: "Contractor Workforce (month locked)",
          },
        });
        await tx.dailyStatus.update({ where: { id: d.id }, data: { locked: true, closed: true, attendanceId: attendance.id } });
      }

      for (const a of report.assignments) {
        const problems = await payrollProblems(a, body.year, body.month);
        const base = { employeeId: a.employeeId, assignmentId: a.assignmentId, year: body.year, month: body.month };
        if (!a.prefill.ok || problems.length > 0) {
          const list = [...(a.prefill.ok ? [] : [a.prefill.reason]), ...problems];
          await tx.suggestion.upsert({
            where: { assignmentId_year_month_kind: { assignmentId: a.assignmentId, year: body.year, month: body.month, kind: "payroll_blocker" } },
            create: { ...base, kind: "payroll_blocker", detail: JSON.stringify({ problems: list }) }, update: { detail: JSON.stringify({ problems: list }), status: "pending_admin" },
          });
          continue;
        }
        const unpaid = a.summary.suggestedUnpaidDays;
        const detail: PrefillDetail = {
          unitsWorked: a.prefill.unitsWorked, rateOverride: a.prefill.rateOverride, suggestedGross: a.prefill.suggestedGross, basisNote: a.prefill.basisNote,
          inputs: {
            payType: a.payType as PrefillDetail["inputs"]["payType"], payRate: a.payRate!, monthlyDayBasis: a.monthlyDayBasis as PrefillDetail["inputs"]["monthlyDayBasis"],
            year: body.year, month: body.month, workingDaysInMonth: a.workingDaysInMonth, outsideUnpaidDays: a.outsideUnpaidDays, unpaidDays: unpaid,
          },
          withoutDeduction: a.prefillWithoutDeduction && a.prefillWithoutDeduction.ok
            ? { unitsWorked: a.prefillWithoutDeduction.unitsWorked, rateOverride: a.prefillWithoutDeduction.rateOverride, suggestedGross: a.prefillWithoutDeduction.suggestedGross } : null,
        };
        await tx.suggestion.upsert({
          where: { assignmentId_year_month_kind: { assignmentId: a.assignmentId, year: body.year, month: body.month, kind: "prefill" } },
          create: { ...base, kind: "prefill", detail: JSON.stringify(detail) }, update: { detail: JSON.stringify(detail), status: "pending_admin", decidedBy: null, decidedReason: null, decidedAt: null },
        });
        if (detail.withoutDeduction) {
          const dd: DeductionDetail = { unpaidDays: unpaid, amountReduction: detail.withoutDeduction.suggestedGross - detail.suggestedGross };
          await tx.suggestion.upsert({
            where: { assignmentId_year_month_kind: { assignmentId: a.assignmentId, year: body.year, month: body.month, kind: "deduction" } },
            create: { ...base, kind: "deduction", detail: JSON.stringify(dd) }, update: { detail: JSON.stringify(dd), status: "pending_admin", decidedBy: null, decidedReason: null, decidedAt: null },
          });
        }
        if (a.summary.needsLateReview) {
          await tx.suggestion.upsert({
            where: { assignmentId_year_month_kind: { assignmentId: a.assignmentId, year: body.year, month: body.month, kind: "warning" } },
            create: { ...base, kind: "warning", detail: JSON.stringify({ reason: `${a.summary.lateDays} late days this month` }) }, update: {},
          });
        }
      }
    }, { timeout: 60_000 });

    await logAudit({ session, action: "month_lock", entity: "MonthLock", details: { ...body, daysLocked: days.length, signedOff: signed } });
    return NextResponse.json({ data: { locked: true, daysLocked: days.length, signedOff: signed } }, { status: 201 });
  } catch (error) {
    return workforceError(error, "lock month");
  }
}
