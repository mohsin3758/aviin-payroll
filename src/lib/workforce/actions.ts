import { z } from "zod";
import {
  recordCheckIn, recordCheckOut, recordEod, recordPulseAnswer, WorkforceError, type Actor,
} from "@/lib/workforce/daily";

/** The contractor-facing action body, shared by the portal route and the signed-link route. */
export const contractorActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("checkin") }),
  z.object({ action: z.literal("checkout") }),
  z.object({ action: z.literal("pulse"), answer: z.enum(["online", "break", "leave"]).default("online") }),
  z.object({
    action: z.literal("eod"),
    mode: z.enum(["web_link", "whatsapp_flow", "free_text"]).default("web_link"),
    completed: z.string().max(2000).optional().nullable(),
    inProgress: z.string().max(2000).optional().nullable(),
    blockers: z.string().max(2000).optional().nullable(),
    hours: z.number().min(0).max(24).optional().nullable(),
    tomorrow: z.string().max(2000).optional().nullable(),
    raw: z.string().max(2000).optional().nullable(),
  }),
]);

export type ContractorAction = z.infer<typeof contractorActionSchema>;

export async function performContractorAction(assignmentId: string, body: ContractorAction, channel: string, actor: Actor) {
  switch (body.action) {
    case "checkin":
      return recordCheckIn({ assignmentId, channel, actor });
    case "checkout":
      return recordCheckOut({ assignmentId, channel, actor });
    case "pulse":
      return recordPulseAnswer({ assignmentId, answer: body.answer, actor });
    case "eod":
      return recordEod({
        assignmentId, mode: body.mode, actor,
        fields: { completed: body.completed, inProgress: body.inProgress, blockers: body.blockers, hours: body.hours, tomorrow: body.tomorrow, raw: body.raw },
      });
    default:
      throw new WorkforceError("Unknown action.", 400);
  }
}
