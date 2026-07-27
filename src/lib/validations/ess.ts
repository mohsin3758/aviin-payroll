import { z } from "zod";

const dateInput = z.preprocess((val) => {
  if (val === null || val === undefined || val === "") return val;
  if (typeof val === "string") {
    return val.length === 10 ? `${val}T00:00:00.000Z` : val;
  }
  return val;
}, z.coerce.date());

// Self-editable subset of Employee — bank/PAN/Aadhaar/UAN are read-only in the ESS profile
// (changes to those go through document upload + HR verification instead, not instant edit).
export const updateOwnProfileSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$|^\+91[\s-]?[6-9]\d{9}$/, "Invalid Indian phone number")
    .nullable()
    .optional(),
  bloodGroup: z.string().trim().max(10).nullable().optional(),
  emergencyContact: z.string().trim().max(200).nullable().optional(),
  currentAddress: z.string().trim().max(500).nullable().optional(),
  permanentAddress: z.string().trim().max(500).nullable().optional(),
});

export const familyMemberSchema = z.object({
  name: z.string().trim().min(1).max(100),
  relation: z.enum(["spouse", "father", "mother", "child", "other"]),
  dateOfBirth: dateInput.nullable().optional(),
  occupation: z.string().trim().max(100).nullable().optional(),
  isDependent: z.boolean().default(true),
});

export const educationSchema = z.object({
  degree: z.string().trim().min(1).max(150),
  institution: z.string().trim().min(1).max(200),
  yearOfPassing: z.coerce.number().int().min(1950).max(2100),
  grade: z.string().trim().max(50).nullable().optional(),
});

export const experienceSchema = z.object({
  companyName: z.string().trim().min(1).max(200),
  designation: z.string().trim().min(1).max(150),
  fromDate: dateInput,
  toDate: dateInput.nullable().optional(),
  reasonForLeaving: z.string().trim().max(500).nullable().optional(),
});
