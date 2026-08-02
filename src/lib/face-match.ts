// Server-side half of face verification. The client (browser, via face-api.js) does all the
// actual computer vision — face detection, alignment, and descriptor extraction — and only ever
// sends a 128-number descriptor over the wire, never a photo. This file just compares two
// descriptors and decides whether they're the same person; it has no camera/ML dependency of
// its own, so it needs no browser APIs and is safe to import from any API route.

export const FACE_DESCRIPTOR_LENGTH = 128;

// face-api.js's own FaceMatcher defaults to 0.6 for "same person" on its recognition-net
// descriptors — below this Euclidean distance is a match, at or above is a different person
// (or no reliable match at all).
export const FACE_MATCH_THRESHOLD = 0.6;

export function isValidDescriptor(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === FACE_DESCRIPTOR_LENGTH &&
    value.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

export function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export interface FaceMatchResult {
  matched: boolean;
  distance: number;
  confidence: number; // 0-100, only meaningful when matched
}

export function matchFaceDescriptors(live: number[], stored: number[]): FaceMatchResult {
  const distance = euclideanDistance(live, stored);
  const matched = distance <= FACE_MATCH_THRESHOLD;
  const confidence = Math.max(0, Math.round((1 - distance / FACE_MATCH_THRESHOLD) * 100));
  return { matched, distance, confidence };
}
