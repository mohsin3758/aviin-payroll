import { z } from "zod";
import { WORKFORCE_FLAG_KEYS } from "@/lib/workforce/flags";

export const WORK_MODES = ["remote", "onsite", "hybrid"] as const;
export const ASSIGNMENT_TIERS = ["full_time", "hourly"] as const;
export const CONTRACT_TYPES = ["exclusive", "non_exclusive", "restricted"] as const;
export const ASSIGNMENT_STATUSES = ["planned", "active", "paused", "ended"] as const;
export const PAY_TYPES = ["monthly", "daily", "hourly"] as const;
export const MONTHLY_DAY_BASES = ["calendar", "working"] as const;
export const CONTACT_KINDS = ["representative", "coordinator", "billing"] as const;

const timezone = z.string().trim().min(1).max(64);
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();

export const createClientSchema = z.object({
  name: z.string().trim().min(1).max(200),
  timezone: timezone.default("Asia/Kolkata"),
  notes: optionalText(2000),
});

export const updateClientSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  active: z.boolean().optional(),
  timezone: timezone.optional(),
  notes: optionalText(2000),
});

export const createContactSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: optionalText(30),
  email: z.string().trim().toLowerCase().email().optional().nullable(),
  kind: z.enum(CONTACT_KINDS).default("representative"),
});

export const updateContactSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  phone: optionalText(30),
  email: z.string().trim().toLowerCase().email().optional().nullable(),
  kind: z.enum(CONTACT_KINDS).optional(),
  active: z.boolean().optional(),
});

export const createClientHolidaySchema = z.object({
  date: z.coerce.date(),
  name: z.string().trim().min(1).max(200),
});

export const createProjectSchema = z.object({
  clientId: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  workMode: z.enum(WORK_MODES).default("remote"),
  location: optionalText(300),
  timezone: timezone.optional().nullable(),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
});

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  active: z.boolean().optional(),
  workMode: z.enum(WORK_MODES).optional(),
  location: optionalText(300),
  timezone: timezone.optional().nullable(),
  startDate: z.coerce.date().optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
});

// "1,2,3,4,5" — comma-separated weekday numbers, 0=Sunday..6=Saturday, no duplicates.
const workingDays = z
  .string()
  .regex(/^[0-6](,[0-6])*$/, "workingDays must look like 1,2,3,4,5 (0=Sunday..6=Saturday)")
  .refine((v) => new Set(v.split(",")).size === v.split(",").length, "workingDays must not repeat a day");

const assignmentFields = {
  clientRepContactId: z.string().min(1).optional().nullable(),
  resourceCoordinatorId: z.string().min(1).optional().nullable(),
  clientCoordinatorId: z.string().min(1).optional().nullable(),
  kamId: z.string().min(1).optional().nullable(),
  endDate: z.coerce.date().optional().nullable(),
  workMode: z.enum(WORK_MODES).optional(),
  location: optionalText(300),
  timezone: timezone.optional(),
  tier: z.enum(ASSIGNMENT_TIERS).optional(),
  expectedHoursPerDay: z.number().positive().max(24).optional().nullable(),
  expectedHoursPerWeek: z.number().positive().max(168).optional().nullable(),
  workingDays: workingDays.optional(),
  contractType: z.enum(CONTRACT_TYPES).optional(),
  declarationAt: z.coerce.date().optional().nullable(),
  declarationNote: optionalText(2000),
  payType: z.enum(PAY_TYPES).optional(),
  payRate: z.number().positive().optional().nullable(),
  monthlyDayBasis: z.enum(MONTHLY_DAY_BASES).optional(),
  status: z.enum(ASSIGNMENT_STATUSES).optional(),
};

export const createAssignmentSchema = z
  .object({
    employeeId: z.string().min(1),
    projectId: z.string().min(1),
    startDate: z.coerce.date(),
    ...assignmentFields,
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, { message: "endDate cannot be before startDate", path: ["endDate"] });

export const updateAssignmentSchema = z.object({
  startDate: z.coerce.date().optional(),
  ...assignmentFields,
});

export const setFlagSchema = z.object({
  key: z.enum(WORKFORCE_FLAG_KEYS),
  scope: z.enum(["company", "client", "project"]).default("company"),
  scopeId: z.string().min(1).optional(),
  enabled: z.boolean(),
}).refine((v) => v.scope === "company" || !!v.scopeId, { message: "scopeId is required for client/project scope", path: ["scopeId"] });
