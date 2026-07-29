import { z } from "zod";

// The exact set of employee/payroll-detail fields a bank-file column can pull from — matches
// what src/app/api/payroll/[runId]/bank-file/route.ts already computes per row today.
export const BANK_FORMAT_FIELDS = [
  "employeeCode",
  "beneficiaryName",
  "bankName",
  "accountNumber",
  "ifsc",
  "amount",
  "narration",
] as const;
export type BankFormatField = (typeof BANK_FORMAT_FIELDS)[number];

export const columnDefSchema = z
  .object({
    order: z.number().int().min(0),
    header: z.string().trim().min(1).max(100),
    source: z.enum(["field", "fixed"]),
    field: z.enum(BANK_FORMAT_FIELDS).optional(),
    fixedValue: z.string().trim().max(200).optional(),
  })
  .refine((c) => (c.source === "field" ? !!c.field : true), {
    message: "field is required when source is 'field'",
    path: ["field"],
  })
  .refine((c) => (c.source === "fixed" ? c.fixedValue !== undefined : true), {
    message: "fixedValue is required when source is 'fixed'",
    path: ["fixedValue"],
  });
export type ColumnDef = z.infer<typeof columnDefSchema>;

// The entire set of client-writable fields for a BankFormat.
export const createBankFormatSchema = z.object({
  name: z.string().trim().min(1).max(100),
  isDefault: z.boolean().optional().default(false),
  columns: z.array(columnDefSchema).min(1, "At least one column is required").max(30),
});
export const updateBankFormatSchema = createBankFormatSchema.partial();
