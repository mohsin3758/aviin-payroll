import { z } from "zod";

export const createHolidaySchema = z.object({
  name: z.string().trim().min(1).max(200),
  date: z.coerce.date(),
  type: z.enum(["holiday", "optional"]).default("holiday"),
});

export const editHolidaySchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  date: z.coerce.date().optional(),
  type: z.enum(["holiday", "optional"]).optional(),
});

export const weeklyOffDaysSchema = z.object({
  weeklyOffDays: z
    .array(z.number().int().min(0).max(6))
    .max(7),
});
