import { z } from "zod";

export const updateSettingsSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  address: z.string().trim().max(500).nullable().optional(),
  pan: z
    .string()
    .trim()
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, "Invalid PAN format")
    .nullable()
    .optional(),
  tan: z
    .string()
    .trim()
    .regex(/^[A-Z]{4}[0-9]{5}[A-Z]{1}$/, "Invalid TAN format")
    .nullable()
    .optional(),
  gstin: z
    .string()
    .trim()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, "Invalid GSTIN format")
    .nullable()
    .optional(),
  pfNumber: z.string().trim().max(50).nullable().optional(),
  esiNumber: z.string().trim().max(50).nullable().optional(),
  state: z.string().trim().min(1).max(50).optional(),
  financialYearStart: z.string().trim().max(20).optional(),
  payrollMonth: z.coerce.number().int().min(1).max(12).optional(),
  payrollYear: z.coerce.number().int().min(2000).max(2100).optional(),
  // Array of day-of-week numbers (0=Sunday..6=Saturday) that are paid non-working days every week.
  weeklyOffDays: z.array(z.coerce.number().int().min(0).max(6)).max(7).optional(),
});
