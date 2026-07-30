export type BillingType = "percentage" | "flat";

export interface BillingInput {
  billingType: string | null;
  billingValue: number | null;
  annualSalary: number | null;
}

/**
 * Computes the one-time placement fee charged to the client. "percentage" means billingValue is
 * a percent of annualSalary (e.g. 8.33% of CTC); "flat" means billingValue is the amount
 * directly. Returns null when there isn't enough information to compute a real number — never
 * silently substitutes a guessed value.
 */
export function computeBillingAmount(input: BillingInput): number | null {
  if (!input.billingType || input.billingValue == null) return null;
  if (input.billingType === "flat") return input.billingValue;
  if (input.billingType === "percentage") {
    if (input.annualSalary == null) return null;
    return Math.round((input.annualSalary * input.billingValue) / 100);
  }
  return null;
}
