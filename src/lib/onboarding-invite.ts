import { randomBytes, createHash } from "crypto";
import { db } from "@/lib/db";

export const INVITE_TTL_DAYS = 14;

// "sent"/"in_progress" are the normal editable window; "rejected" is deliberately also
// editable — it's the one path that reopens a submitted invite so the candidate can fix
// whatever HR flagged. "submitted" is intentionally NOT editable (awaiting review) and is
// checked separately so its error message can be more specific than "no longer editable".
const EDITABLE_STATUSES = ["sent", "in_progress", "rejected"] as const;
const TERMINAL_STATUSES = ["approved", "revoked"] as const;

export function isEditableStatus(status: string): boolean {
  return (EDITABLE_STATUSES as readonly string[]).includes(status);
}

export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only this hash is ever persisted — the raw token exists solely in the URL/email, never at
 * rest, so a database read alone can never leak a working onboarding link. */
export function hashInviteToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function isInviteExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() < now.getTime();
}

export function newExpiry(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + INVITE_TTL_DAYS);
  return d;
}

export class InviteAccessError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Looks up an OnboardingInvite by raw token. `mode: "read"` allows any non-terminal status
 * (including expired/submitted) since a status-check screen should always be reachable;
 * `mode: "write"` additionally requires an editable, non-expired status. Never distinguishes
 * "token doesn't exist" from "token is malformed" in its error — both 404, so the response
 * can't be used to fish for valid-looking tokens. */
export async function resolveInviteByToken(rawToken: string, mode: "read" | "write") {
  const tokenHash = hashInviteToken(rawToken);
  const invite = await db.onboardingInvite.findUnique({
    where: { tokenHash },
    include: { employee: { include: { salaryStructure: true } } },
  });
  if (!invite) {
    throw new InviteAccessError("This onboarding link is invalid.", 404);
  }
  if ((TERMINAL_STATUSES as readonly string[]).includes(invite.status)) {
    throw new InviteAccessError(
      invite.status === "approved" ? "This onboarding has already been completed." : "This onboarding link has been revoked.",
      410
    );
  }
  if (mode === "write") {
    if (invite.status === "submitted") {
      throw new InviteAccessError("Your submission is already awaiting HR review.", 409);
    }
    if (!isEditableStatus(invite.status)) {
      throw new InviteAccessError("This onboarding link can no longer be edited.", 409);
    }
    if (isInviteExpired(invite.expiresAt)) {
      throw new InviteAccessError("This onboarding link has expired. Ask HR to resend it.", 410);
    }
  }
  return invite;
}

// Admin-side status-transition guards, same shape as VALID_TRANSITIONS in
// src/app/api/loans/[id]/route.ts.
const REVIEW_TRANSITIONS: Record<string, string[]> = {
  submitted: ["approved", "rejected"],
};

export function canReview(currentStatus: string, decision: "approved" | "rejected"): boolean {
  return (REVIEW_TRANSITIONS[currentStatus] ?? []).includes(decision);
}

/** resend/revoke are both allowed from any status except a fully-approved (irreversible)
 * invite — an already-active employee's onboarding link has nothing left to resend/revoke. */
export function canResendOrRevoke(currentStatus: string): boolean {
  return currentStatus !== "approved";
}

/** Issues a fresh raw token, persists only its hash, and resets the expiry window. Returns the
 * raw token so the caller can build the email link and (per this app's convention of returning
 * secrets directly in admin responses, e.g. activate-portal's tempPassword) include it in the
 * API response too, so HR isn't stuck if the email silently fails to send. */
export async function rotateInviteToken(inviteId: string, setStatus?: string): Promise<string> {
  const rawToken = generateInviteToken();
  await db.onboardingInvite.update({
    where: { id: inviteId },
    data: {
      tokenHash: hashInviteToken(rawToken),
      expiresAt: newExpiry(),
      resentAt: new Date(),
      ...(setStatus ? { status: setStatus } : {}),
    },
  });
  return rawToken;
}
