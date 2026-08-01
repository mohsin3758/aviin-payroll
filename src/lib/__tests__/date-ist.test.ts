import { describe, it, expect } from "vitest";
import { istDateOnly } from "@/lib/date-ist";

describe("istDateOnly", () => {
  it("attributes a UTC instant just before IST midnight to the next UTC day", () => {
    // 2026-08-01T19:00:00Z + 5:30 = 2026-08-02T00:30 IST — already the next IST calendar day.
    const result = istDateOnly(new Date("2026-08-01T19:00:00.000Z"));
    expect(result.toISOString()).toBe("2026-08-02T00:00:00.000Z");
  });

  it("keeps an instant just after UTC midnight on the same IST day it was made", () => {
    // 2026-08-01T21:33:39Z (Ashwini's real mis-filed punch) = 2026-08-02T03:03:39 IST.
    const result = istDateOnly(new Date("2026-08-01T21:33:39.054Z"));
    expect(result.toISOString()).toBe("2026-08-02T00:00:00.000Z");
  });

  it("keeps an evening-IST instant on the same UTC day (no boundary crossing)", () => {
    // 2026-07-31T13:30:42Z = 2026-07-31T19:00:42 IST — same calendar day both ways.
    const result = istDateOnly(new Date("2026-07-31T13:30:42.210Z"));
    expect(result.toISOString()).toBe("2026-07-31T00:00:00.000Z");
  });

  it("is a no-op right at UTC midnight (05:30 IST)", () => {
    const result = istDateOnly(new Date("2026-08-02T00:00:00.000Z"));
    expect(result.toISOString()).toBe("2026-08-02T00:00:00.000Z");
  });
});
