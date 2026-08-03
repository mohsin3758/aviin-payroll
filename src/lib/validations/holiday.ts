import { z } from "zod";

export const HOLIDAY_CATEGORIES = ["national", "festival", "other"] as const;

export const createHolidaySchema = z.object({
  name: z.string().trim().min(1).max(200),
  date: z.coerce.date(),
  type: z.enum(["holiday", "optional"]).default("holiday"),
  category: z.enum(HOLIDAY_CATEGORIES).default("other"),
});

export const editHolidaySchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  date: z.coerce.date().optional(),
  type: z.enum(["holiday", "optional"]).optional(),
  category: z.enum(HOLIDAY_CATEGORIES).optional(),
});

export const weeklyOffDaysSchema = z.object({
  weeklyOffDays: z
    .array(z.number().int().min(0).max(6))
    .max(7),
});
