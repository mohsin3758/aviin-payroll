import { signButtonPayload } from "@/lib/workforce/tokens";
import type { MessageType } from "@/lib/workforce/planner";

/**
 * Maps a message type to its approved WhatsApp template (names and wording in
 * docs/WHATSAPP_TEMPLATES.md) and builds the variables and buttons. Business logic asks for a
 * MessageType; only this file knows template names, so a re-submitted template changes one place.
 */
export interface TemplateBuildContext {
  type: MessageType;
  seq: number;
  assignmentId: string;
  dateKey: string;
  /** Recipient first name (contractor) or contact name (client). */
  recipientName: string;
  contractorName: string;
  projectName: string;
  /** "9:00 AM" */
  shiftStartLabel: string;
  /** "3 November" */
  dateLabel: string;
  /** Raw action token for URL buttons (contractor page or client confirmation page). */
  urlToken?: string;
}

export interface BuiltTemplate {
  templateName: string;
  bodyParams: string[];
  quickReplyPayloads?: string[];
  urlSuffix?: string;
  /** Plain-text rendering for the email fallback and for the message log. */
  plainText: string;
}

export function fmt12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function buildTemplate(c: TemplateBuildContext): BuiltTemplate {
  const sign = (action: Parameters<typeof signButtonPayload>[0], seq = 0) => signButtonPayload(action, c.assignmentId, c.dateKey, seq);
  switch (c.type) {
    case "CHECK_IN":
      return {
        templateName: "checkin_prompt",
        bodyParams: [c.recipientName, c.projectName, c.shiftStartLabel],
        quickReplyPayloads: [sign("checkin"), sign("leave")],
        plainText: `Hi ${c.recipientName}, your shift for ${c.projectName} starts at ${c.shiftStartLabel}. Please check in.`,
      };
    case "LATE_REMINDER":
    case "FINAL_REMINDER":
      return {
        templateName: "checkin_reminder",
        bodyParams: [c.recipientName, c.projectName, c.shiftStartLabel],
        quickReplyPayloads: [sign("checkin"), sign("leave"), sign("help")],
        plainText: `Hi ${c.recipientName}, we have not received your check-in for ${c.projectName} today. Your shift started at ${c.shiftStartLabel}.`,
      };
    case "STILL_ONLINE":
      return {
        templateName: "pulse_online",
        bodyParams: [c.recipientName, c.projectName],
        quickReplyPayloads: [sign("pulse_yes", c.seq), sign("pulse_break", c.seq), sign("pulse_leave", c.seq)],
        plainText: `Hi ${c.recipientName}, quick check: are you online and working on ${c.projectName}?`,
      };
    case "END_OF_DAY":
      return {
        templateName: "eod_prompt",
        bodyParams: [c.recipientName, c.projectName],
        urlSuffix: c.urlToken,
        plainText: `Hi ${c.recipientName}, please send today's update for ${c.projectName}.`,
      };
    case "EOD_REMINDER":
      return {
        templateName: "eod_reminder",
        bodyParams: [c.recipientName, c.projectName],
        urlSuffix: c.urlToken,
        plainText: `Hi ${c.recipientName}, your update for ${c.projectName} today is still pending.`,
      };
    case "CLIENT_STATUS_NOTICE":
      return {
        templateName: "client_status_notice",
        bodyParams: [c.recipientName, c.contractorName, c.projectName],
        plainText: `Hello ${c.recipientName}, this is Aviin. Today's status for ${c.contractorName} on ${c.projectName} is pending confirmation. We are following up.`,
      };
    case "CLIENT_DIGEST":
      return {
        templateName: "client_daily_digest",
        bodyParams: [c.recipientName, c.projectName, c.dateLabel],
        urlSuffix: c.urlToken,
        plainText: `Hello ${c.recipientName}, the workforce summary for ${c.projectName} on ${c.dateLabel} is ready for your review.`,
      };
  }
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function dateLabelOf(day: Date): string {
  return `${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]}`;
}

export function publicBaseUrl(): string {
  return (process.env.PUBLIC_APP_URL || "https://payroll.aviintech.com").replace(/\/$/, "");
}
