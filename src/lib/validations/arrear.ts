import { z } from "zod";

export const createArrearSchema = z.object({
  employeeId: z.string().min(1),
  amount: z.coerce.number().positive(),
  reason: z.string().trim().max(500).nullable().optional(),
  payMonth: z.coerce.number().int().min(1).max(12),
  payYear: z.coerce.number().int().min(2000).max(2100),
});
