import { z } from "zod";

// Explicit allowlist — the entire set of client-writable Candidate fields. Deliberately no
// PF/ESI/bank/tax fields — a Candidate is an externally-placed contract/full-time hire tracked
// for Hiring Incentive purposes, not an in-house payroll employee (see Employee for that).
export const createCandidateSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().max(100).nullable().optional(),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$|^\+91[\s-]?[6-9]\d{9}$/, "Invalid Indian phone number")
    .nullable()
    .optional(),
  email: z.string().trim().email().nullable().optional(),
  client: z.string().trim().max(100).nullable().optional(),
  role: z.string().trim().min(1).max(100),
  employmentType: z.enum(["permanent", "contractor"]),
  recruiterId: z.string().trim().min(1).nullable().optional(),
  closingDate: z.coerce.date().nullable().optional(),
  dateOfJoining: z.coerce.date(),
  probationEndDate: z.coerce.date().nullable().optional(),
  dateOfExit: z.coerce.date().nullable().optional(),
  monthlySalary: z.coerce.number().min(0).nullable().optional(),
  annualSalary: z.coerce.number().min(0).nullable().optional(),
  billingType: z.enum(["percentage", "flat"]).nullable().optional(),
  billingValue: z.coerce.number().min(0).nullable().optional(),
  paymentReceived: z.boolean().optional(),
  comment: z.string().trim().max(1000).nullable().optional(),
});

export const updateCandidateSchema = createCandidateSchema.partial();
