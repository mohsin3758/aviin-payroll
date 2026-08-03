import { z } from "zod";

const dateInput = z.preprocess((val) => {
  if (val === null || val === undefined || val === "") return val;
  if (typeof val === "string") {
    return val.length === 10 ? `${val}T00:00:00.000Z` : val;
  }
  return val;
}, z.coerce.date());

// Admin/hr only — creates the Employee (onboardingStatus: "onboarding") + the invite. Always
// the full set whether or not candidateId is supplied: Candidate has no department/state, so
// it can never fully drive employee creation on its own.
export const createOnboardingInviteSchema = z.object({
  candidateId: z.string().min(1).nullable().optional(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().max(100).nullable().optional(),
  email: z.string().trim().email(),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$|^\+91[\s-]?[6-9]\d{9}$/, "Invalid Indian phone number")
    .nullable()
    .optional(),
  designation: z.string().trim().min(1).max(100),
  department: z.string().trim().min(1).max(100),
  client: z.string().trim().max(100).nullable().optional(),
  employmentType: z.enum(["permanent", "contractor", "daily_wage", "hourly"]).default("permanent"),
  dateOfJoining: dateInput,
});

// The candidate-editable subset — deliberately tighter than updateEmployeeSchema. Excludes
// every HR-controlled field (employeeCode, dateOfJoining, designation, department, client,
// employmentType, state, pf/esi/pt/lwfApplicable, taxRegime, salaryStructure) so a
// token-authenticated, unauthenticated-by-session request can never touch them.
export const onboardingSubmissionSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$|^\+91[\s-]?[6-9]\d{9}$/, "Invalid Indian phone number")
    .nullable()
    .optional(),
  dateOfBirth: dateInput.nullable().optional(),
  gender: z.enum(["male", "female", "other"]).optional(),
  bloodGroup: z.string().trim().max(10).nullable().optional(),
  currentAddress: z.string().trim().max(500).nullable().optional(),
  permanentAddress: z.string().trim().max(500).nullable().optional(),
  emergencyContact: z.string().trim().max(100).nullable().optional(),
  panNumber: z
    .string()
    .trim()
    .regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, "Invalid PAN format")
    .nullable()
    .optional(),
  aadhaarNumber: z.string().trim().max(20).nullable().optional(),
  bankName: z.string().trim().max(100).nullable().optional(),
  bankAccountNumber: z.string().trim().max(30).nullable().optional(),
  bankIfsc: z
    .string()
    .trim()
    .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Invalid IFSC format")
    .nullable()
    .optional(),
});

// Fields/documents required before final submission is accepted — checked server-side in the
// /submit route, not baked into onboardingSubmissionSchema itself (which stays a permissive
// partial-update schema so each step's autosave can send just what that step collects).
export const REQUIRED_SUBMISSION_FIELDS = [
  "phone",
  "dateOfBirth",
  "gender",
  "currentAddress",
  "permanentAddress",
  "emergencyContact",
  "panNumber",
  "aadhaarNumber",
  "bankName",
  "bankAccountNumber",
  "bankIfsc",
] as const;

export const REQUIRED_SUBMISSION_DOC_TYPES = ["photo", "pan", "aadhaar", "bank_proof", "education_certificate"] as const;

export const reviewInviteSchema = z
  .object({
    decision: z.enum(["approved", "rejected"]),
    reason: z.string().trim().max(1000).optional(),
  })
  .refine((v) => v.decision !== "rejected" || !!v.reason?.trim(), {
    message: "A reason is required when rejecting.",
    path: ["reason"],
  });
