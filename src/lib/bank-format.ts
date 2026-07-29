import type { ColumnDef } from "@/lib/validations/bank-format";

export interface BankFileRow {
  employeeCode: string;
  beneficiaryName: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  amount: number;
  narration: string;
}

export interface BuiltBankFile {
  headers: string[];
  rows: (string | number)[][];
}

/**
 * Maps each existing computed bank-file row (the same shape attendance/payroll code already
 * builds) into the exact column order a BankFormat defines. Fixed-text columns repeat their
 * value on every row. Pure and deterministic — this determines where real salary payments go,
 * so nothing here is inferred or guessed; it only ever does exactly what the column defs say.
 */
export function buildBankFileRows(columns: ColumnDef[], rows: BankFileRow[]): BuiltBankFile {
  const sorted = [...columns].sort((a, b) => a.order - b.order);

  const headers = sorted.map((c) => c.header);

  const builtRows = rows.map((row) =>
    sorted.map((col) => {
      if (col.source === "fixed") {
        return col.fixedValue ?? "";
      }
      switch (col.field) {
        case "employeeCode":
          return row.employeeCode;
        case "beneficiaryName":
          return row.beneficiaryName;
        case "bankName":
          return row.bankName;
        case "accountNumber":
          return row.accountNumber;
        case "ifsc":
          return row.ifsc;
        case "amount":
          return row.amount;
        case "narration":
          return row.narration;
        default:
          return "";
      }
    })
  );

  return { headers, rows: builtRows };
}

/** Columns whose values must be written as text, never a numeric cell — Excel otherwise
 * strips leading zeros or renders long digit strings in scientific notation, silently
 * corrupting a real bank account/IFSC number. */
export const TEXT_FORMAT_FIELDS = new Set<ColumnDef["field"]>(["accountNumber", "ifsc", "employeeCode"]);
