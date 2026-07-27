import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { notifyEmployee } from "@/lib/notifications";

const decisionSchema = z.object({ approved: z.boolean() });

// PUT /api/expense-claims/[id] — admin/hr only. Approving immediately creates a SalaryArrear
// targeting next month's payroll (the same injection mechanism leave encashment already uses),
// so the reimbursement actually gets paid out through the normal payroll run.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id } = await params;
    const body = await request.json();
    const { approved } = decisionSchema.parse(body);

    const existing = await db.expenseClaim.findUnique({ where: { id } });
    if (!existing) return apiError("Expense claim not found", 404);
    if (existing.status !== "pending") {
      return apiError(`This claim is already ${existing.status}.`, 409);
    }

    if (!approved) {
      const claim = await db.expenseClaim.update({ where: { id }, data: { status: "rejected", approvedBy: session.userId, approvedAt: new Date() } });
      await logAudit({ session, action: "reject", entity: "ExpenseClaim", entityId: id });
      await notifyEmployee(existing.employeeId, { title: "Expense claim rejected", message: `Your ${existing.category} claim for ₹${existing.amount.toLocaleString("en-IN")} was rejected.`, category: "general" });
      return NextResponse.json({ data: claim });
    }

    const now = new Date();
    const nextMonth = now.getMonth() + 2 > 12 ? 1 : now.getMonth() + 2;
    const nextYear = now.getMonth() + 2 > 12 ? now.getFullYear() + 1 : now.getFullYear();

    const result = await db.$transaction(async (tx) => {
      const arrear = await tx.salaryArrear.create({
        data: {
          employeeId: existing.employeeId,
          amount: existing.amount,
          type: "arrear",
          reason: `Expense reimbursement: ${existing.category}${existing.description ? ` — ${existing.description}` : ""}`,
          payMonth: nextMonth,
          payYear: nextYear,
        },
      });
      const claim = await tx.expenseClaim.update({
        where: { id },
        data: { status: "approved", approvedBy: session.userId, approvedAt: now, paidInRunId: arrear.id },
      });
      return claim;
    });

    await logAudit({ session, action: "approve", entity: "ExpenseClaim", entityId: id, details: { amount: existing.amount } });
    await notifyEmployee(existing.employeeId, {
      title: "Expense claim approved",
      message: `Your ${existing.category} claim for ₹${existing.amount.toLocaleString("en-IN")} was approved and will be paid in your ${nextMonth}/${nextYear} salary.`,
      category: "general",
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    return handleApiError(error, "process expense claim");
  }
}
