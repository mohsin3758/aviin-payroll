import { describe, it, expect } from "vitest";
import { generateResetToken, hashResetToken, isResetExpired, newResetExpiry, RESET_TTL_MINUTES } from "../password-reset";

describe("token generation", () => {
  it("generates a URL-safe raw token", () => {
    const token = generateResetToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThan(20);
  });

  it("generates different tokens on each call", () => {
    expect(generateResetToken()).not.toBe(generateResetToken());
  });
});

describe("hashResetToken", () => {
  it("is deterministic for the same input", () => {
    const raw = generateResetToken();
    expect(hashResetToken(raw)).toBe(hashResetToken(raw));
  });

  it("never returns the raw token itself", () => {
    const raw = generateResetToken();
    expect(hashResetToken(raw)).not.toBe(raw);
  });

  it("produces a 64-char hex sha256 digest", () => {
    expect(hashResetToken(generateResetToken())).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces different hashes for different tokens", () => {
    expect(hashResetToken(generateResetToken())).not.toBe(hashResetToken(generateResetToken()));
  });
});

describe("expiry", () => {
  it("newResetExpiry is RESET_TTL_MINUTES ahead of the given time", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const expiry = newResetExpiry(now);
    expect(expiry.getTime() - now.getTime()).toBe(RESET_TTL_MINUTES * 60_000);
  });

  it("is not expired exactly at the boundary instant", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(isResetExpired(now, now)).toBe(false);
  });

  it("is expired one millisecond past the boundary", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(isResetExpired(now, new Date(now.getTime() + 1))).toBe(true);
  });

  it("is not expired one millisecond before the boundary", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(isResetExpired(now, new Date(now.getTime() - 1))).toBe(false);
  });
});
