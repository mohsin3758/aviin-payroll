import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { handleApiError, apiError } from "@/lib/api-utils";
import { getSalarySlipData } from "@/lib/payroll/salary-slip";
import { buildSalarySlipEmailHtml } from "@/lib/payroll/salary-slip-email";
import { sendEmail } from "@/lib/mailer";

interface BulkResult {
  employeeId: string;
  name: string;
  email: string | null;
  status: "sent" | "failed" | "skipped";
  error?: string;
}

// POST /api/salary-slip/send-bulk  { payrollRunId }
// Emails every employee's salary slip for a given payroll run in one action.
export async function POST(request: NextRequest) {
  try {
    await requireRole(request, ["admin", "hr"]);

    const body = await request.json();
    const { payrollRunId } = body;

    if (!payrollRunId) {
      return apiError("payrollRunId is required", 400);
    }

    const run = await db.payrollRun.findUnique({
      where: { id: payrollRunId },
      include: { details: { include: { employee: true } } },
    });

    if (!run) {
      return apiError("Payroll run not found", 404);
    }

    const results = await Promise.allSettled(
      run.details.map(async (detail): Promise<BulkResult> => {
        const name = detail.employee
          ? `${detail.employee.firstName} ${detail.employee.lastName ?? ""}`.trim()
          : detail.employeeId;

        if (!detail.employee?.email) {
          return { employeeId: detail.employeeId, name, email: null, status: "skipped", error: "No email on file" };
        }

        try {
          const slip = await getSalarySlipData(detail.employeeId, run.month, run.year);
          const html = buildSalarySlipEmailHtml(slip);
          await sendEmail({
            to: slip.employee.email,
            subject: `Salary Slip — ${slip.monthName} ${slip.year}`,
            html,
          });
          return { employeeId: detail.employeeId, name, email: detail.employee.email, status: "sent" };
        } catch (err) {
          return {
            employeeId: detail.employeeId,
            name,
            email: detail.employee.email,
            status: "failed",
            error: err instanceof Error ? err.message : "Unknown error",
          };
        }
      })
    );

    const rows = results.map((r) =>
      r.status === "fulfilled"
        ? r.value
        : ({ employeeId: "unknown", name: "unknown", email: null, status: "failed", error: "Unexpected error" } as BulkResult)
    );

    const summary = {
      total: rows.length,
      sent: rows.filter((r) => r.status === "sent").length,
      failed: rows.filter((r) => r.status === "failed").length,
      skipped: rows.filter((r) => r.status === "skipped").length,
      results: rows,
    };

    return NextResponse.json(summary);
  } catch (error) {
    return handleApiError(error, "send bulk salary slips");
  }
}
