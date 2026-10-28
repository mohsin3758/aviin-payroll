import { describe, it, expect } from "vitest";
import { boardColumn, type BoardFacts } from "../board";

const base: BoardFacts = { state: "pending", hasCheckIn: false, hasCheckOut: false, eodDone: false, closed: false, openExceptions: 0, shiftOver: false };
const col = (o: Partial<BoardFacts>) => boardColumn({ ...base, ...o });

describe("boardColumn", () => {
  it("nobody has checked in yet", () => expect(col({})).toBe("Not Started"));
  it("checked in on time", () => expect(col({ state: "present", hasCheckIn: true })).toBe("Checked In"));
  it("checked in late", () => expect(col({ state: "late", hasCheckIn: true })).toBe("Late"));
  it("checked out", () => expect(col({ state: "present", hasCheckIn: true, hasCheckOut: true })).toBe("Checked Out"));
  it("approved leave", () => expect(col({ state: "leave" })).toBe("Leave"));
  it("closed absence is Unavailable", () => expect(col({ state: "absent", closed: true })).toBe("Unavailable"));
  it("checked in, shift over, no update is Missing Update", () => {
    expect(col({ state: "present", hasCheckIn: true, shiftOver: true })).toBe("Missing Update");
    expect(col({ state: "present", hasCheckIn: true, shiftOver: true, eodDone: true })).toBe("Checked In");
  });
  it("an open exception always wins, so it cannot be missed", () => {
    expect(col({ state: "present", hasCheckIn: true, openExceptions: 1 })).toBe("Exception");
    expect(col({ state: "leave", openExceptions: 2 })).toBe("Exception");
    expect(col({ openExceptions: 1 })).toBe("Exception");
  });
  it("holidays and weekly offs are Off unless the contractor worked anyway", () => {
    expect(col({ state: "holiday" })).toBe("Off");
    expect(col({ state: "weekly_off" })).toBe("Off");
    expect(col({ state: "holiday", hasCheckIn: true })).toBe("Checked In");
  });
});
