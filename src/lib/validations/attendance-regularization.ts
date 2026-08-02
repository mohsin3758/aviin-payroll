import { z } from "zod";

export const createRegularizationSchema = z
  .object({
    employeeId: z.string().min(1).optional(), // admin/hr/manager only — employees always use their own
    date: z.coerce.date(),
    requestedPunchIn: z.coerce.date().nullable().optional(),
    requestedPunchOut: z.coerce.date().nullable().optional(),
    reason: z.string().trim().min(1).max(1000),
  })
  .refine((d) => d.requestedPunchIn || d.requestedPunchOut, {
    message: "At least one of requestedPunchIn or requestedPunchOut is required.",
    path: ["requestedPunchIn"],
  });

export const reviewRegularizationSchema = z.object({
  approved: z.boolean(),
  comment: z.string().trim().max(1000).nullable().optional(),
});
