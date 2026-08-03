import { z } from "zod";

export const createLeaveBalanceSchema = z.object({
  employeeId: z.string().min(1),
  leaveTypeId: z.string().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  totalAllocated: z.coerce.number().min(0).max(365),
  carryForwarded: z.coerce.number().min(0).max(365).default(0),
});

// Manual corrections always require a reason — not persisted as a column, just passed straight
// into the audit log, so every direct balance edit has a human-readable justification attached.
export const editLeaveBalanceSchema = z.object({
  totalAllocated: z.coerce.number().min(0).max(365).optional(),
  carryForwarded: z.coerce.number().min(0).max(365).optional(),
  used: z.coerce.number().min(0).max(365).optional(),
  reason: z.string().trim().min(1).max(500),
});
