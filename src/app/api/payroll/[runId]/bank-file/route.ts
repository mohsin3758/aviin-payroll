import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import Papa from "papaparse";
import { apiError, handleApiError } from "@/lib/api-utils";
import { requirePayrollFeature } from "@/lib/payroll-access";
import { getMonthName } from "@/lib/payroll/engine";
import { buildBankFileRows, TEXT_FORMAT_FIELDS, type BankFileRow } from "@/lib/bank-format";
import type { ColumnDef } from "@/lib/validations/bank-format";

type Params = { params: Promise<{ runId: string }> };

// GET /api/payroll/[runId]/bank-file?format=csv|xlsx|json&bankFormatId=...
// format=csv/json: the original generic NEFT/RTGS-style layout (Beneficiary Name / Bank /
// Account / IFSC / Amount / Narration), unchanged — always available even with no BankFormat
// configured. format=xlsx: a real .xlsx built from an admin-configured BankFormat's exact
// column layout (bankFormatId, or whichever format is marked default if omitted).
export async function GET(request: NextRequest, { params }: Params) {
  try {
    await requirePayrollFeature(request, ["admin", "hr"], "download_bank_file");
    const { runId } = await params;
    const format = request.nextUrl.searchParams.get("format") ?? "json";
    const bankFormatId = request.nextUrl.searchParams.get("bankFormatId");

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

    if (format === "xlsx") {
      const bankFormat = bankFormatId
        ? await db.bankFormat.findUnique({ where: { id: bankFormatId } })
        : await db.bankFormat.findFirst({ where: { companyId: payrollRun.companyId, isDefault: true } });

      if (!bankFormat) {
        return apiError(
          bankFormatId
            ? "That bank format was not found."
            : "No bank format is configured yet (and none is set as default). Set one up under Settings → Bank Transfer Formats, or use format=csv for the generic layout.",
          400
        );
      }

      const columns: ColumnDef[] = JSON.parse(bankFormat.columns);
      const bankFileRows: BankFileRow[] = rows.map((r) => ({
        employeeCode: r.employeeCode,
        beneficiaryName: r.beneficiaryName,
        bankName: r.bankName,
        accountNumber: r.accountNumber,
        ifsc: r.ifsc,
        amount: r.amount,
        narration: r.narration,
      }));
      const { headers, rows: builtRows } = buildBankFileRows(columns, bankFileRows);
      const sortedColumns = [...columns].sort((a, b) => a.order - b.order);

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Bank Transfer");
      sheet.addRow(headers);
      // Account numbers, IFSC, and employee codes must be written as text — Excel otherwise
      // strips leading zeros or renders long digit strings in scientific notation, silently
      // corrupting a real bank account number.
      sortedColumns.forEach((col, idx) => {
        if (TEXT_FORMAT_FIELDS.has(col.field)) {
          sheet.getColumn(idx + 1).numFmt = "@";
        }
      });
      builtRows.forEach((row) => sheet.addRow(row));
      sheet.columns.forEach((col) => { col.width = 20; });

      const buffer = await workbook.xlsx.writeBuffer();
      return new NextResponse(Buffer.from(buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="bank-file-${payrollRun.month}-${payrollRun.year}-${bankFormat.name}.xlsx"`,
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
