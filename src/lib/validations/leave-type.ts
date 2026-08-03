import { z } from "zod";

export const createLeaveTypeSchema = z.object({
  name: z.string().trim().min(1).max(100),
  shortCode: z.string().trim().min(1).max(10),
  totalDays: z.coerce.number().min(0).max(365),
  isCarryForward: z.boolean().default(true),
  maxCarryForward: z.coerce.number().min(0).max(365).default(0),
  isPaid: z.boolean().default(true),
});

export const editLeaveTypeSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  shortCode: z.string().trim().min(1).max(10).optional(),
  totalDays: z.coerce.number().min(0).max(365).optional(),
  isCarryForward: z.boolean().optional(),
  maxCarryForward: z.coerce.number().min(0).max(365).optional(),
  isPaid: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const allocateLeaveTypeSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
});
