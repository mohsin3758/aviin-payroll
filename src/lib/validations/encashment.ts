import { z } from "zod";

export const createEncashmentSchema = z.object({
  employeeId: z.string().min(1),
  leaveTypeId: z.string().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  payMonth: z.coerce.number().int().min(1).max(12),
  payYear: z.coerce.number().int().min(2000).max(2100),
});
