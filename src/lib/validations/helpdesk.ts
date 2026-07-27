import { z } from "zod";

export const HELPDESK_CATEGORIES = ["payroll", "leave", "it", "hr", "general"] as const;
export const HELPDESK_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;

export const createTicketSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(4000),
  category: z.enum(HELPDESK_CATEGORIES).default("general"),
});

export const updateTicketSchema = z.object({
  status: z.enum(HELPDESK_STATUSES),
});

export const replySchema = z.object({
  message: z.string().trim().min(1).max(4000),
});
