import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePayrollFeature, inEmployeeScope } from "@/lib/payroll-access";
import { handleApiError, apiError, getDefaultCompanyId } from "@/lib/api-utils";
import { getForm16Data, Form16Error } from "@/lib/payroll/form16";
import { buildForm16EmailHtml } from "@/lib/payroll/form16-email";
import { sendEmail } from "@/lib/mailer";

interface BulkResult {
  employeeId: string;
  name: string;
  email: string | null;
  status: "sent" | "failed" | "skipped";
  error?: string;
}

// POST /api/form16/send-bulk  { fyStartYear }
// Emails Form 16 Part B to every employee with processed payroll in the given financial year.
// Employees with no payroll data for that FY (e.g. joined later) are skipped, not failed.
export async function POST(request: NextRequest) {
  try {
    const { restriction } = await requirePayrollFeature(request, ["admin", "hr"], "manage_form16");

    const body = await request.json();
    const { fyStartYear: fyStartYearRaw } = body;
    const fyStartYear = Number(fyStartYearRaw);

    if (!fyStartYearRaw || isNaN(fyStartYear) || fyStartYear < 2000 || fyStartYear > 2100) {
      return apiError("fyStartYear must be a valid year", 400);
    }

    const companyId = await getDefaultCompanyId();
    const employees = await db.employee.findMany({ where: { companyId } });

    const results = await Promise.allSettled(
      employees.map(async (employee): Promise<BulkResult> => {
        const name = `${employee.firstName} ${employee.lastName ?? ""}`.trim();

        if (!inEmployeeScope(restriction, employee.id)) {
          return { employeeId: employee.id, name, email: employee.email ?? null, status: "skipped", error: "Outside your payroll access scope" };
        }

        if (!employee.email) {
          return { employeeId: employee.id, name, email: null, status: "skipped", error: "No email on file" };
        }

        try {
          const form16 = await getForm16Data(employee.id, fyStartYear);
          const html = buildForm16EmailHtml(form16);
          await sendEmail({
            to: employee.email,
            subject: `Form 16 (Part B) — FY ${form16.financialYear}`,
            html,
          });
          return { employeeId: employee.id, name, email: employee.email, status: "sent" };
        } catch (err) {
          if (err instanceof Form16Error) {
            return { employeeId: employee.id, name, email: employee.email, status: "skipped", error: err.message };
          }
          return {
            employeeId: employee.id,
            name,
            email: employee.email,
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
    return handleApiError(error, "send bulk Form 16");
  }
}
