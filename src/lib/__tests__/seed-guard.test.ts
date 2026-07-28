import { describe, it, expect } from "vitest";
import { evaluateSeedGuard } from "../seed-guard";

describe("evaluateSeedGuard", () => {
  it("always allows a genuine first-run bootstrap (no users yet), regardless of environment", () => {
    expect(evaluateSeedGuard({ nodeEnv: "production", allowDemoReseedEnv: undefined, usersAlreadyExist: false }).allowed).toBe(true);
    expect(evaluateSeedGuard({ nodeEnv: "development", allowDemoReseedEnv: undefined, usersAlreadyExist: false }).allowed).toBe(true);
  });

  it("allows a reseed with users already present in development", () => {
    const result = evaluateSeedGuard({ nodeEnv: "development", allowDemoReseedEnv: undefined, usersAlreadyExist: true });
    expect(result.allowed).toBe(true);
  });

  it("blocks a reseed with users already present in production by default", () => {
    const result = evaluateSeedGuard({ nodeEnv: "production", allowDemoReseedEnv: undefined, usersAlreadyExist: true });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/permanently delete/i);
  });

  it("allows a production reseed only when explicitly overridden", () => {
    const result = evaluateSeedGuard({ nodeEnv: "production", allowDemoReseedEnv: "true", usersAlreadyExist: true });
    expect(result.allowed).toBe(true);
  });

  it("does not treat any other value as an override (must be exactly 'true')", () => {
    const result = evaluateSeedGuard({ nodeEnv: "production", allowDemoReseedEnv: "1", usersAlreadyExist: true });
    expect(result.allowed).toBe(false);
  });
});
