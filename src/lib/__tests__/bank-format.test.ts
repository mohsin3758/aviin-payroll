import { describe, it, expect } from "vitest";
import { buildBankFileRows, TEXT_FORMAT_FIELDS, type BankFileRow } from "../bank-format";
import type { ColumnDef } from "../validations/bank-format";

const sampleRow: BankFileRow = {
  employeeCode: "EMP001",
  beneficiaryName: "Jane Doe",
  bankName: "HDFC Bank",
  accountNumber: "0012345678",
  ifsc: "HDFC0000123",
  amount: 45000,
  narration: "Salary July 2026",
};

describe("buildBankFileRows", () => {
  it("maps a field column to the right value", () => {
    const columns: ColumnDef[] = [{ order: 0, header: "A/C No", source: "field", field: "accountNumber" }];
    const { headers, rows } = buildBankFileRows(columns, [sampleRow]);
    expect(headers).toEqual(["A/C No"]);
    expect(rows).toEqual([["0012345678"]]);
  });

  it("repeats a fixed-text column's value on every row", () => {
    const columns: ColumnDef[] = [{ order: 0, header: "Mode", source: "fixed", fixedValue: "NEFT" }];
    const { rows } = buildBankFileRows(columns, [sampleRow, { ...sampleRow, employeeCode: "EMP002" }]);
    expect(rows).toEqual([["NEFT"], ["NEFT"]]);
  });

  it("respects column order regardless of the array's definition order", () => {
    const columns: ColumnDef[] = [
      { order: 1, header: "IFSC", source: "field", field: "ifsc" },
      { order: 0, header: "Account", source: "field", field: "accountNumber" },
    ];
    const { headers, rows } = buildBankFileRows(columns, [sampleRow]);
    expect(headers).toEqual(["Account", "IFSC"]);
    expect(rows).toEqual([["0012345678", "HDFC0000123"]]);
  });

  it("builds a full multi-column row correctly", () => {
    const columns: ColumnDef[] = [
      { order: 0, header: "Name", source: "field", field: "beneficiaryName" },
      { order: 1, header: "Account", source: "field", field: "accountNumber" },
      { order: 2, header: "IFSC", source: "field", field: "ifsc" },
      { order: 3, header: "Amount", source: "field", field: "amount" },
      { order: 4, header: "Type", source: "fixed", fixedValue: "NEFT" },
    ];
    const { rows } = buildBankFileRows(columns, [sampleRow]);
    expect(rows).toEqual([["Jane Doe", "0012345678", "HDFC0000123", 45000, "NEFT"]]);
  });

  it("renders missing/empty employee bank details as an empty string, not a crash", () => {
    const columns: ColumnDef[] = [{ order: 0, header: "Account", source: "field", field: "accountNumber" }];
    const { rows } = buildBankFileRows(columns, [{ ...sampleRow, accountNumber: "" }]);
    expect(rows).toEqual([[""]]);
  });

  it("does not mutate the input columns array", () => {
    const columns: ColumnDef[] = [
      { order: 1, header: "B", source: "field", field: "ifsc" },
      { order: 0, header: "A", source: "field", field: "accountNumber" },
    ];
    const original = [...columns];
    buildBankFileRows(columns, [sampleRow]);
    expect(columns).toEqual(original);
  });
});

describe("TEXT_FORMAT_FIELDS", () => {
  it("marks account number, IFSC, and employee code as text-only fields", () => {
    expect(TEXT_FORMAT_FIELDS.has("accountNumber")).toBe(true);
    expect(TEXT_FORMAT_FIELDS.has("ifsc")).toBe(true);
    expect(TEXT_FORMAT_FIELDS.has("employeeCode")).toBe(true);
  });

  it("does not mark amount or narration as text-only", () => {
    expect(TEXT_FORMAT_FIELDS.has("amount")).toBe(false);
    expect(TEXT_FORMAT_FIELDS.has("narration")).toBe(false);
  });

  it("returns false for a fixed column's undefined field", () => {
    expect(TEXT_FORMAT_FIELDS.has(undefined)).toBe(false);
  });
});
