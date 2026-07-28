export interface SeedGuardInput {
  nodeEnv: string | undefined;
  allowDemoReseedEnv: string | undefined;
  usersAlreadyExist: boolean;
}

export interface SeedGuardResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Decides whether POST /api/seed's destructive reseed (which deletes the Company record and
 * everything under it) may proceed. A genuinely first-run bootstrap (no users yet) is always
 * allowed — there's nothing to destroy. Once users exist, a production environment blocks it
 * by default, since NODE_ENV is 'production' automatically for this app's Docker/standalone
 * build with no separate config needed — unless explicitly overridden via ALLOW_DEMO_RESEED.
 */
export function evaluateSeedGuard(input: SeedGuardInput): SeedGuardResult {
  if (!input.usersAlreadyExist) {
    return { allowed: true };
  }
  if (input.nodeEnv === "production" && input.allowDemoReseedEnv !== "true") {
    return {
      allowed: false,
      reason:
        "Refusing to reset demo data on a production deployment that already has users — this would permanently delete the current company, employees, and payroll history. " +
        "If this is genuinely a demo/staging instance you want reset, set ALLOW_DEMO_RESEED=true in its environment and try again.",
    };
  }
  return { allowed: true };
}
