import { randomBytes, createHash } from "crypto";
import { db } from "@/lib/db";

// Much shorter than OnboardingInvite's 14-day TTL — a leaked reset link is a direct
// credential-recovery risk, so this window is kept tight.
export const RESET_TTL_MINUTES = 60;

export function generateResetToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only this hash is ever persisted — the raw token exists solely in the URL/email, never at
 * rest, so a database read alone can never leak a working reset link. */
export function hashResetToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function isResetExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() < now.getTime();
}

export function newResetExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + RESET_TTL_MINUTES * 60_000);
}

/** Looks up a PasswordResetToken by raw token. Never distinguishes "doesn't exist" from
 * "expired" from "already used" to the caller — all collapse to null — so neither the API
 * response nor timing can be used to fish for which specific reason applied. */
export async function resolveResetToken(rawToken: string) {
  const tokenHash = hashResetToken(rawToken);
  const record = await db.passwordResetToken.findUnique({ where: { tokenHash }, include: { user: true } });
  if (!record) return null;
  if (record.usedAt) return null;
  if (isResetExpired(record.expiresAt)) return null;
  return record;
}
