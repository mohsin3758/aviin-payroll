import { z } from "zod";

export const upsertInvestmentDeclarationSchema = z.object({
  employeeId: z.string().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  section80C: z.coerce.number().min(0).max(1000000),
  section80D: z.coerce.number().min(0).max(1000000),
  // HR-only: locks (or reopens) the declaration against further self-edits. Omitted on a plain
  // amount edit, which leaves the existing status untouched.
  status: z.enum(["declared", "verified"]).optional(),
});
