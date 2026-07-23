import { z } from "zod";

export const createLoanSchema = z.object({
  employeeId: z.string().min(1),
  loanType: z.enum(["loan", "advance"]),
  principal: z.coerce.number().positive(),
  emiAmount: z.coerce.number().positive(),
  totalMonths: z.coerce.number().int().positive().max(240),
  startMonth: z.coerce.number().int().min(1).max(12),
  startYear: z.coerce.number().int().min(2000).max(2100),
  reason: z.string().trim().max(500).nullable().optional(),
});

export const updateLoanStatusSchema = z.object({
  status: z.enum(["active", "closed", "cancelled"]),
});
