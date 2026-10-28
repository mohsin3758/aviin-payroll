import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { db } from "@/lib/db";

/**
 * Signed, expiring links for people with no login: a contractor's web check-in / end-of-day page
 * and a client representative's confirmation page. Same approach as OnboardingInvite: the raw
 * token only ever exists in the link; only its SHA-256 hash is stored.
 */
export type TokenPurpose = "contractor" | "client";

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function createActionToken(params: {
  purpose: TokenPurpose;
  assignmentId?: string;
  contactId?: string;
  projectId?: string;
  date?: Date;
  ttlHours: number;
  now?: Date;
}): Promise<string> {
  const raw = randomBytes(24).toString("base64url");
  const now = params.now ?? new Date();
  await db.actionToken.create({
    data: {
      tokenHash: hashToken(raw),
      purpose: params.purpose,
      assignmentId: params.assignmentId ?? null,
      contactId: params.contactId ?? null,
      projectId: params.projectId ?? null,
      date: params.date ?? null,
      expiresAt: new Date(now.getTime() + params.ttlHours * 3_600_000),
    },
  });
  return raw;
}

export class TokenError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** One generic message for unknown, malformed, wrong-purpose and expired tokens, so a response can't be used to probe. */
export async function resolveActionToken(raw: string, purpose: TokenPurpose, now: Date = new Date()) {
  const row = raw && raw.length >= 16 && raw.length <= 128 ? await db.actionToken.findUnique({ where: { tokenHash: hashToken(raw) } }) : null;
  if (!row || row.purpose !== purpose || row.expiresAt.getTime() < now.getTime()) {
    throw new TokenError("This link is invalid or has expired.", 404);
  }
  return row;
}

// ---- Signed button payloads (WhatsApp quick replies) --------------------------------------
// A quick-reply button carries a payload we choose at send time. It is signed so a payload can't
// be forged to act on someone else's assignment.
const SECRET = () => process.env.JWT_SECRET || "dev-only-insecure-secret-change-me";

export type ButtonAction = "checkin" | "leave" | "pulse_yes" | "pulse_break" | "pulse_leave" | "help";

export function signButtonPayload(action: ButtonAction, assignmentId: string, dateKey: string, seq = 0): string {
  const body = `${action}.${assignmentId}.${dateKey}.${seq}`;
  const mac = createHmac("sha256", SECRET()).update(body).digest("base64url").slice(0, 16);
  return `${body}.${mac}`;
}

export function verifyButtonPayload(
  payload: string
): { action: ButtonAction; assignmentId: string; dateKey: string; seq: number } | null {
  const parts = payload.split(".");
  if (parts.length !== 5) return null;
  const [action, assignmentId, dateKey, seq, mac] = parts;
  const expected = createHmac("sha256", SECRET()).update(`${action}.${assignmentId}.${dateKey}.${seq}`).digest("base64url").slice(0, 16);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (!["checkin", "leave", "pulse_yes", "pulse_break", "pulse_leave", "help"].includes(action)) return null;
  return { action: action as ButtonAction, assignmentId, dateKey, seq: Number(seq) || 0 };
}

/** Verifies Meta's X-Hub-Signature-256 header ("sha256=<hex>") over the raw request body. */
export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const given = header.slice("sha256=".length);
  const a = Buffer.from(given, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}
