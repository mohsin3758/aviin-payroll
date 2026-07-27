import { z } from "zod";

export const EXPENSE_CATEGORIES = ["travel", "food", "accommodation", "medical", "other"] as const;

export const createExpenseClaimSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.coerce.number().positive().max(10000000),
  description: z.string().trim().max(1000).nullable().optional(),
  expenseDate: z.coerce.date(),
});
