import { z } from "zod";

export const ROLES = ["admin", "hr", "manager", "employee"] as const;

export const createUserSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(100),
  name: z.string().trim().min(1).max(100),
  role: z.enum(ROLES),
});

export const updateUserSchema = z.object({
  active: z.boolean().optional(),
  role: z.enum(ROLES).optional(),
});

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(8).max(100),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100),
});
