import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import Papa from "papaparse";
import { apiError, handleApiError } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth";
import { getMonthName } from "@/lib/payroll/engine";

type Params = { params: Promise<{ runId: string }> };

// GET /api/payroll/[runId]/bank-file?format=csv
// Generic NEFT/RTGS-style salary disbursement file: one row per employee with a net
// salary > 0. This is a widely-compatible generic format (Beneficiary Name / Account /
// IFSC / Amount / Narration) — a specific bank's own upload template can differ and would
// need to be adapted from this once a target bank is chosen.
export async function GET(request: NextRequest, { params }: Params) {
  try {
    await requireRole(request, ["admin", "hr"]);
    const { runId } = await params;
    const format = request.nextUrl.searchParams.get("format") ?? "json";

    const payrollRun = await db.payrollRun.findUnique({
      where: { id: runId },
      include: {
        company: { select: { name: true } },
        details: {
          include: {
            employee: {
              select: {
                employeeCode: true,
                firstName: true,
                lastName: true,
                bankName: true,
                bankAccountNumber: true,
                bankIfsc: true,
              },
            },
          },
          orderBy: { employee: { employeeCode: "asc" } },
        },
      },
    });

    if (!payrollRun) {
      return apiError("Payroll run not found", 404);
    }

    if (payrollRun.status === "draft") {
      return apiError(
        "This payroll run is still a draft. Mark it as processed (after review) before generating a bank file.",
        400
      );
    }

    const rows: {
      employeeCode: string;
      beneficiaryName: string;
      bankName: string;
      accountNumber: string;
      ifsc: string;
      amount: number;
      narration: string;
      status: string;
    }[] = [];
    const missingBankDetails: string[] = [];

    const narration = `Salary ${getMonthName(payrollRun.month)} ${payrollRun.year}`;

    for (const detail of payrollRun.details) {
      if (detail.netSalary <= 0) continue;
      const emp = detail.employee;
      const hasBankDetails = !!(emp.bankAccountNumber && emp.bankIfsc);
      if (!hasBankDetails) {
        missingBankDetails.push(emp.employeeCode);
      }
      rows.push({
        employeeCode: emp.employeeCode,
        beneficiaryName: `${emp.firstName} ${emp.lastName ?? ""}`.trim(),
        bankName: emp.bankName ?? "",
        accountNumber: emp.bankAccountNumber ?? "",
        ifsc: emp.bankIfsc ?? "",
        amount: detail.netSalary,
        narration,
        status: hasBankDetails ? "OK" : "MISSING BANK DETAILS",
      });
    }

    if (format === "csv") {
      const csv = Papa.unparse(rows);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="bank-file-${payrollRun.month}-${payrollRun.year}.csv"`,
        },
      });
    }

    return NextResponse.json({
      data: {
        month: payrollRun.month,
        year: payrollRun.year,
        monthName: getMonthName(payrollRun.month),
        company: payrollRun.company.name,
        totalAmount: rows.reduce((s, r) => s + r.amount, 0),
        totalEmployees: rows.length,
        rows,
      },
      warnings:
        missingBankDetails.length > 0
          ? [`${missingBankDetails.length} employee(s) are missing bank account/IFSC details and will need manual disbursement: ${missingBankDetails.join(", ")}.`]
          : [],
    });
  } catch (error) {
    return handleApiError(error, "generate bank file");
  }
}
