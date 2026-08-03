import { describe, it, expect } from "vitest";
import {
  hashInviteToken, generateInviteToken, isInviteExpired, newExpiry, isEditableStatus,
  canReview, canResendOrRevoke, INVITE_TTL_DAYS,
} from "../onboarding-invite";
import {
  createOnboardingInviteSchema, onboardingSubmissionSchema, reviewInviteSchema,
} from "../validations/onboarding-invite";

describe("token helpers", () => {
  it("generates a URL-safe raw token", () => {
    const token = generateInviteToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThan(20);
  });

  it("hashes deterministically and never returns the raw token", () => {
    const raw = generateInviteToken();
    const hash1 = hashInviteToken(raw);
    const hash2 = hashInviteToken(raw);
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(raw);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces different hashes for different tokens", () => {
    expect(hashInviteToken(generateInviteToken())).not.toBe(hashInviteToken(generateInviteToken()));
  });
});

describe("expiry", () => {
  it("newExpiry is INVITE_TTL_DAYS ahead of the given time", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const expiry = newExpiry(now);
    expect(expiry.getTime() - now.getTime()).toBe(INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  });

  it("is not expired exactly at the boundary instant", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(isInviteExpired(now, now)).toBe(false);
  });

  it("is expired one millisecond past the boundary", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const justAfter = new Date(now.getTime() + 1);
    expect(isInviteExpired(now, justAfter)).toBe(true);
  });

  it("is not expired one millisecond before the boundary", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const justBefore = new Date(now.getTime() - 1);
    expect(isInviteExpired(now, justBefore)).toBe(false);
  });
});

describe("isEditableStatus", () => {
  it("allows sent, in_progress, and rejected", () => {
    expect(isEditableStatus("sent")).toBe(true);
    expect(isEditableStatus("in_progress")).toBe(true);
    expect(isEditableStatus("rejected")).toBe(true);
  });

  it("disallows submitted, approved, and revoked", () => {
    expect(isEditableStatus("submitted")).toBe(false);
    expect(isEditableStatus("approved")).toBe(false);
    expect(isEditableStatus("revoked")).toBe(false);
  });
});

describe("canReview", () => {
  it("allows submitted -> approved and submitted -> rejected", () => {
    expect(canReview("submitted", "approved")).toBe(true);
    expect(canReview("submitted", "rejected")).toBe(true);
  });

  it("disallows reviewing from any other status", () => {
    for (const status of ["sent", "in_progress", "approved", "rejected", "revoked"]) {
      expect(canReview(status, "approved")).toBe(false);
      expect(canReview(status, "rejected")).toBe(false);
    }
  });
});

describe("canResendOrRevoke", () => {
  it("allows every status except approved", () => {
    for (const status of ["sent", "in_progress", "submitted", "rejected", "revoked"]) {
      expect(canResendOrRevoke(status)).toBe(true);
    }
    expect(canResendOrRevoke("approved")).toBe(false);
  });
});

describe("createOnboardingInviteSchema", () => {
  const base = {
    firstName: "Asha",
    email: "asha@example.com",
    designation: "Software Engineer",
    department: "Engineering",
    dateOfJoining: "2026-03-01",
  };

  it("accepts a minimal valid payload and defaults employmentType", () => {
    const parsed = createOnboardingInviteSchema.parse(base);
    expect(parsed.employmentType).toBe("permanent");
  });

  it("rejects a missing designation", () => {
    const { designation: _designation, ...rest } = base;
    expect(() => createOnboardingInviteSchema.parse(rest)).toThrow();
  });

  it("rejects an invalid email", () => {
    expect(() => createOnboardingInviteSchema.parse({ ...base, email: "not-an-email" })).toThrow();
  });

  it("rejects an invalid phone number", () => {
    expect(() => createOnboardingInviteSchema.parse({ ...base, phone: "12345" })).toThrow();
  });

  it("accepts a valid Indian phone number", () => {
    expect(() => createOnboardingInviteSchema.parse({ ...base, phone: "9876543210" })).not.toThrow();
  });
});

describe("onboardingSubmissionSchema", () => {
  it("accepts a fully empty object (each step submits partial data)", () => {
    expect(() => onboardingSubmissionSchema.parse({})).not.toThrow();
  });

  it("rejects an invalid PAN", () => {
    expect(() => onboardingSubmissionSchema.parse({ panNumber: "INVALID" })).toThrow();
  });

  it("accepts a valid PAN", () => {
    expect(() => onboardingSubmissionSchema.parse({ panNumber: "ABCDE1234F" })).not.toThrow();
  });

  it("rejects an invalid IFSC", () => {
    expect(() => onboardingSubmissionSchema.parse({ bankIfsc: "invalid-ifsc" })).toThrow();
  });

  it("accepts a valid IFSC", () => {
    expect(() => onboardingSubmissionSchema.parse({ bankIfsc: "HDFC0001234" })).not.toThrow();
  });

  it("silently strips HR-controlled fields not in the schema", () => {
    const parsed = onboardingSubmissionSchema.parse({
      phone: "9876543210",
      designation: "CEO",
      department: "Executive",
      employeeCode: "EMP9999",
      salaryStructure: { basic: 999999 },
    });
    expect(parsed).not.toHaveProperty("designation");
    expect(parsed).not.toHaveProperty("department");
    expect(parsed).not.toHaveProperty("employeeCode");
    expect(parsed).not.toHaveProperty("salaryStructure");
  });
});

describe("reviewInviteSchema", () => {
  it("accepts an approval with no reason", () => {
    expect(() => reviewInviteSchema.parse({ decision: "approved" })).not.toThrow();
  });

  it("rejects a rejection with no reason", () => {
    expect(() => reviewInviteSchema.parse({ decision: "rejected" })).toThrow();
  });

  it("rejects a rejection with a blank reason", () => {
    expect(() => reviewInviteSchema.parse({ decision: "rejected", reason: "   " })).toThrow();
  });

  it("accepts a rejection with a real reason", () => {
    expect(() => reviewInviteSchema.parse({ decision: "rejected", reason: "IFSC looks wrong" })).not.toThrow();
  });
});
