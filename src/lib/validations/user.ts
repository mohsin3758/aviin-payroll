import { z } from "zod";

export const ROLES = ["admin", "hr", "manager", "employee"] as const;

export const createUserSchema = z.object({
  // Lowercased so it always matches the login lookup, which also normalizes to lowercase
  // (SQLite's default text comparison is case-sensitive, and email casing isn't meaningful).
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(100),
  name: z.string().trim().min(1).max(100),
  role: z.enum(ROLES),
  employeeId: z.string().min(1).nullable().optional(),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  active: z.boolean().optional(),
  role: z.enum(ROLES).optional(),
  // Links (or, passed as null, unlinks) this login to an Employee record after the fact —
  // for a user created via Add User (no linking step) rather than Activate ESS Portal.
  employeeId: z.string().min(1).nullable().optional(),
});

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(8).max(100),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100),
});
