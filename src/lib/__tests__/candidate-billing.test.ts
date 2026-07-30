import { describe, it, expect } from "vitest";
import { computeBillingAmount } from "../candidate-billing";

describe("computeBillingAmount", () => {
  it("computes a flat fee directly, ignoring salary", () => {
    expect(computeBillingAmount({ billingType: "flat", billingValue: 50000, annualSalary: null })).toBe(50000);
  });

  it("computes a percentage of annual salary", () => {
    expect(computeBillingAmount({ billingType: "percentage", billingValue: 10, annualSalary: 600000 })).toBe(60000);
  });

  it("rounds a percentage computation to the nearest rupee", () => {
    expect(computeBillingAmount({ billingType: "percentage", billingValue: 8.33, annualSalary: 540000 })).toBe(Math.round(540000 * 8.33 / 100));
  });

  it("returns null for percentage billing with no annual salary on record", () => {
    expect(computeBillingAmount({ billingType: "percentage", billingValue: 10, annualSalary: null })).toBeNull();
  });

  it("returns null when no billing type is set", () => {
    expect(computeBillingAmount({ billingType: null, billingValue: null, annualSalary: 600000 })).toBeNull();
  });

  it("returns null when billing value is missing", () => {
    expect(computeBillingAmount({ billingType: "flat", billingValue: null, annualSalary: null })).toBeNull();
  });
});
