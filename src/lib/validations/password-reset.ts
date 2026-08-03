import { z } from "zod";

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

// Reset-with-token's new-password rule is identical to the existing admin reset-password
// schema (src/lib/validations/user.ts's resetPasswordSchema) — reused directly rather than
// duplicated; see src/app/api/auth/reset-password/[token]/route.ts.
