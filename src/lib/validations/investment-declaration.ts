import { z } from "zod";

export const upsertInvestmentDeclarationSchema = z.object({
  employeeId: z.string().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  section80C: z.coerce.number().min(0).max(1000000),
  section80D: z.coerce.number().min(0).max(1000000),
});
