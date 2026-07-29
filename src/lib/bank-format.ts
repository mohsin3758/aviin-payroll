import type { ColumnDef, BankFormatField } from "@/lib/validations/bank-format";

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

const HEADER_CELL_MAX_LEN = 40;

/**
 * Bank-provided sample templates commonly have several rows of instructions/titles above the
 * real header row (merged banner cells, numbered instructions, etc. — see real PNB/HDFC bulk
 * upload sheets). Scores each of the first 40 rows by how many short, non-sentence-like cells
 * it has, and returns the index of the best match. This is only ever used to pre-select a row
 * in a preview the admin can override by clicking a different one — never applied silently.
 */
export function findLikelyHeaderRowIndex(rows: string[][]): number {
  let bestIdx = 0;
  let bestScore = -1;
  const scanLimit = Math.min(rows.length, 40);
  for (let i = 0; i < scanLimit; i++) {
    const score = rows[i].filter((cell) => {
      const trimmed = (cell ?? "").trim();
      return trimmed.length > 0 && trimmed.length <= HEADER_CELL_MAX_LEN && !trimmed.includes(".");
    }).length;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Conservatively guesses which employee/payroll field a bank template's column header refers
 * to. Deliberately narrow: only maps headers that are unambiguous (e.g. "BENEFICIARY ACCOUNT"
 * clearly means the employee's account; a bare "ACCOUNT NUMBER" on a bank template usually
 * means the company's own debit account, which this app has no field for). Anything not
 * confidently matched returns undefined so the admin must map it by hand — this only pre-fills
 * a suggestion the admin still reviews before saving, it never decides where money goes.
 */
export function guessFieldForHeader(header: string): BankFormatField | undefined {
  const h = header.toLowerCase().replace(/\*/g, "").trim();
  if (h.includes("ifsc")) return "ifsc";
  if (h.includes("beneficiary") && (h.includes("account") || h.includes("a/c") || h.includes("acc"))) return "accountNumber";
  if (h.includes("beneficiary") && h.includes("name")) return "beneficiaryName";
  if ((h.includes("employee") || h.includes("emp")) && (h.includes("code") || h.includes("id"))) return "employeeCode";
  if (h.includes("bank") && h.includes("name")) return "bankName";
  if (h.includes("amount")) return "amount";
  if (h.includes("narration") || h.includes("particular") || h.includes("remark")) return "narration";
  return undefined;
}
