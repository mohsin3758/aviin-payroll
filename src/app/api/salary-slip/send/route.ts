import { NextRequest, NextResponse } from "next/server";
import { getSalarySlipData, SalarySlipError } from "@/lib/payroll/salary-slip";
import { buildSalarySlipEmailHtml } from "@/lib/payroll/salary-slip-email";
import { sendEmail } from "@/lib/mailer";
import { requirePayrollFeature, assertEmployeeInScope } from "@/lib/payroll-access";
import { handleApiError } from "@/lib/api-utils";

// POST /api/salary-slip/send  { employeeId, month, year } — admin/hr only, matching its
// sibling send-bulk/route.ts. Only ever called from admin/hr-only pages (Payroll, Salary
// Slips); an employee views/prints their own slip via My Portal instead, they don't trigger
// this send action.
export async function POST(request: NextRequest) {
  try {
    const { restriction } = await requirePayrollFeature(request, ["admin", "hr"], "send_payslips");
    const body = await request.json();
    const { employeeId, month: monthRaw, year: yearRaw } = body;

    if (!employeeId || monthRaw == null || yearRaw == null) {
      return NextResponse.json(
        { error: "employeeId, month, and year are required" },
        { status: 400 }
      );
    }
    assertEmployeeInScope(restriction, employeeId);

    const month = Number(monthRaw);
    const year = Number(yearRaw);

    if (isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: "month must be between 1 and 12" }, { status: 400 });
    }
    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: "year must be a valid year" }, { status: 400 });
    }

    const slip = await getSalarySlipData(employeeId, month, year);

    if (!slip.employee.email) {
      return NextResponse.json(
        { error: "Employee does not have an email address on file" },
        { status: 400 }
      );
    }

    const html = buildSalarySlipEmailHtml(slip);
    const result = await sendEmail({
      to: slip.employee.email,
      subject: `Salary Slip — ${slip.monthName} ${slip.year}`,
      html,
    });

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      previewUrl: result.previewUrl,
    });
  } catch (error) {
    if (error instanceof SalarySlipError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return handleApiError(error, "send salary slip");
  }
}
