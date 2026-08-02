import { describe, it, expect } from "vitest";
import { euclideanDistance, matchFaceDescriptors, isValidDescriptor, FACE_DESCRIPTOR_LENGTH, FACE_MATCH_THRESHOLD } from "@/lib/face-match";

function makeDescriptor(fill: number): number[] {
  return new Array(FACE_DESCRIPTOR_LENGTH).fill(fill);
}

describe("isValidDescriptor", () => {
  it("accepts a 128-length array of finite numbers", () => {
    expect(isValidDescriptor(makeDescriptor(0.1))).toBe(true);
  });
  it("rejects the wrong length", () => {
    expect(isValidDescriptor([1, 2, 3])).toBe(false);
  });
  it("rejects non-arrays and non-numeric entries", () => {
    expect(isValidDescriptor("not an array")).toBe(false);
    expect(isValidDescriptor(null)).toBe(false);
    const withNaN = makeDescriptor(0.1);
    withNaN[5] = NaN;
    expect(isValidDescriptor(withNaN)).toBe(false);
  });
});

describe("euclideanDistance", () => {
  it("is zero for identical descriptors", () => {
    const a = makeDescriptor(0.5);
    expect(euclideanDistance(a, [...a])).toBe(0);
  });
  it("is positive for different descriptors", () => {
    const a = makeDescriptor(0);
    const b = makeDescriptor(1);
    // sqrt(128 * 1^2) = sqrt(128)
    expect(euclideanDistance(a, b)).toBeCloseTo(Math.sqrt(128), 5);
  });
});

describe("matchFaceDescriptors", () => {
  it("matches identical descriptors with 100% confidence", () => {
    const a = makeDescriptor(0.3);
    const result = matchFaceDescriptors(a, [...a]);
    expect(result.matched).toBe(true);
    expect(result.distance).toBe(0);
    expect(result.confidence).toBe(100);
  });

  it("rejects two clearly different faces (distance well over threshold)", () => {
    const a = makeDescriptor(0);
    const b = makeDescriptor(1); // distance ~11.3, way over 0.6
    const result = matchFaceDescriptors(a, b);
    expect(result.matched).toBe(false);
    expect(result.distance).toBeGreaterThan(FACE_MATCH_THRESHOLD);
    expect(result.confidence).toBe(0);
  });

  it("is a boundary match exactly at the threshold", () => {
    // Construct a descriptor whose distance from `a` is exactly FACE_MATCH_THRESHOLD by
    // perturbing a single dimension by that amount.
    const a = makeDescriptor(0);
    const b = makeDescriptor(0);
    b[0] = FACE_MATCH_THRESHOLD;
    const result = matchFaceDescriptors(a, b);
    expect(result.distance).toBeCloseTo(FACE_MATCH_THRESHOLD, 10);
    expect(result.matched).toBe(true); // <= threshold counts as a match
  });
});
