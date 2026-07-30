import { z } from "zod";

// Amount, employmentType, joinDate, eligibleDate, payMonth/payYear are always server-computed —
// never trusted from the client, since this determines a real cash payout.
export const createHiringIncentiveSchema = z.object({
  recruiterId: z.string().min(1),
  candidateId: z.string().min(1),
  reason: z.string().trim().max(500).nullable().optional(),
});

export const updateHiringIncentiveRatesSchema = z.object({
  hiringIncentiveFteRate: z.coerce.number().min(0),
  hiringIncentiveContractRate: z.coerce.number().min(0),
});
