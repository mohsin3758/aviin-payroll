import { z } from "zod";

export const createExitRequestSchema = z.object({
  employeeId: z.string().min(1).optional(), // admin/hr only — employees always use their own
  resignationDate: z.coerce.date(),
  reason: z.string().trim().max(1000).nullable().optional(),
});

export const approveExitRequestSchema = z.object({
  approved: z.boolean(),
  comment: z.string().trim().max(1000).nullable().optional(),
});
