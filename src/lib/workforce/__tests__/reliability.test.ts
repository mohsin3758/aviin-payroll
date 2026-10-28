import { describe, it, expect } from "vitest";
import { computeReliability, bandFor, WEIGHTS, type ReliabilityInput } from "../reliability";

const full = (v: number): ReliabilityInput => ({ attendance: v, timesheet: v, delivery: v, clientFeedback: v, response: v, availability: v, workingDays: 20 });

describe("weights", () => {
  it("add up to 100", () => {
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe("bandFor", () => {
  it("uses the agreed thresholds", () => {
    expect(bandFor(100)).toBe("green");
    expect(bandFor(90)).toBe("green");
    expect(bandFor(89.9)).toBe("yellow");
    expect(bandFor(75)).toBe("yellow");
    expect(bandFor(74.9)).toBe("orange");
    expect(bandFor(60)).toBe("orange");
    expect(bandFor(59.9)).toBe("red");
  });
});

describe("computeReliability", () => {
  it("a perfect record scores 100 and is green", () => {
    const r = computeReliability(full(1));
    expect(r.score).toBe(100);
    expect(r.band).toBe("green");
    expect(r.note).toBeNull();
  });
  it("applies the weights", () => {
    const r = computeReliability({ ...full(1), attendance: 0 }); // lose the 25-point attendance share
    expect(r.score).toBe(75);
    expect(r.band).toBe("yellow");
  });
  it("every component explains itself", () => {
    const r = computeReliability({ ...full(0.8), attendance: 0.95 });
    for (const c of r.components) expect(c.reason.length).toBeGreaterThan(5);
    expect(r.components.find((c) => c.key === "attendance")!.reason).toMatch(/95%/);
  });
  it("a component with no data is excluded and the rest rescaled — never counted as zero", () => {
    // No client data at all (delivery + feedback = 45 points missing); everything else perfect.
    const r = computeReliability({ attendance: 1, timesheet: 1, delivery: null, clientFeedback: null, response: 1, availability: 1, workingDays: 20 });
    expect(r.score).toBe(100);
    expect(r.note).toMatch(/2 component/);
    expect(r.components.find((c) => c.key === "delivery")!.points).toBeNull();
  });
  it("rescaling still reflects a poor record on what is known", () => {
    const r = computeReliability({ attendance: 0.5, timesheet: null, delivery: null, clientFeedback: null, response: null, availability: null, workingDays: 10 });
    expect(r.score).toBe(50);
    expect(r.band).toBe("red");
  });
  it("component points always sum to the score", () => {
    const r = computeReliability({ attendance: 0.9, timesheet: 0.7, delivery: 1, clientFeedback: 0.5, response: 0.8, availability: 1, workingDays: 20 });
    const sum = r.components.reduce((s, c) => s + (c.points ?? 0), 0);
    expect(Math.abs(sum - r.score!)).toBeLessThan(0.2);
  });
  it("clamps out-of-range inputs", () => {
    expect(computeReliability({ ...full(1.5), workingDays: 5 }).score).toBe(100);
    expect(computeReliability({ ...full(-1), workingDays: 5 }).score).toBe(0);
  });
  it("gives no score without working days or without any data", () => {
    expect(computeReliability({ ...full(1), workingDays: 0 }).score).toBeNull();
    expect(computeReliability({ attendance: null, timesheet: null, delivery: null, clientFeedback: null, response: null, availability: null, workingDays: 5 }).score).toBeNull();
  });
});
