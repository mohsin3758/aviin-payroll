import { z } from "zod";

const dateInput = z.preprocess((val) => {
  if (val === null || val === undefined || val === "") return val;
  if (typeof val === "string") {
    return val.length === 10 ? `${val}T00:00:00.000Z` : val;
  }
  return val;
}, z.coerce.date());

const salaryStructureSchema = z.object({
  basic: z.coerce.number().min(0),
  dearnessAllowance: z.coerce.number().min(0).default(0),
  houseRentAllowance: z.coerce.number().min(0),
  conveyanceAllowance: z.coerce.number().min(0).default(1600),
  medicalAllowance: z.coerce.number().min(0).default(1250),
  specialAllowance: z.coerce.number().min(0),
  overtimeAllowance: z.coerce.number().min(0).default(0),
  bonus: z.coerce.number().min(0).default(0),
  otherEarnings: z.coerce.number().min(0).default(0),
  employerPF: z.coerce.number().min(0).default(0),
  employerESI: z.coerce.number().min(0).default(0),
  gratuity: z.coerce.number().min(0).default(0),
  dailyRate: z.coerce.number().min(0).nullable().optional(),
  hourlyRate: z.coerce.number().min(0).nullable().optional(),
});

// Explicit allowlist — this is the entire set of client-writable Employee fields.
// id, companyId, employeeCode(on update), createdAt/updatedAt are NEVER accepted from the client.
export const createEmployeeSchema = z.object({
  employeeCode: z.string().trim().min(1).max(20).optional(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().max(100).nullable().optional(),
  email: z.string().trim().email(),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$|^\+91[\s-]?[6-9]\d{9}$/, "Invalid Indian phone number")
    .nullable()
    .optional(),
  dateOfJoining: dateInput,
  dateOfExit: dateInput.nullable().optional(),
  designation: z.string().trim().min(1).max(100),
  department: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(50).default("Maharashtra"),
  employmentType: z.enum(["permanent", "contractor", "daily_wage", "hourly"]).default("permanent"),
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
  uanNumber: z.string().trim().max(20).nullable().optional(),
  esiNumber: z.string().trim().max(30).nullable().optional(),
  pfApplicable: z.boolean().default(true),
  esiApplicable: z.boolean().default(true),
  ptApplicable: z.boolean().default(true),
  lwfApplicable: z.boolean().default(true),
  taxRegime: z.enum(["new", "old"]).default("new"),
  gender: z.enum(["male", "female", "other"]).default("male"),
  dateOfBirth: dateInput.nullable().optional(),
  bloodGroup: z.string().trim().max(10).nullable().optional(),
  emergencyContact: z.string().trim().max(100).nullable().optional(),
  currentAddress: z.string().trim().max(500).nullable().optional(),
  permanentAddress: z.string().trim().max(500).nullable().optional(),
  salaryStructure: salaryStructureSchema.optional(),
});

export const updateEmployeeSchema = createEmployeeSchema.partial().extend({
  salaryStructure: salaryStructureSchema.partial().optional(),
});
