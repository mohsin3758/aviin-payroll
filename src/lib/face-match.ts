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

// Login is higher-stakes than an attendance punch, so it uses a deliberately tighter cutoff —
// a well-known stricter bound for lower false-accept-rate (vs 0.6's permissive "same person"
// default). Fixed, not admin-configurable.
export const FACE_LOGIN_MATCH_THRESHOLD = 0.42;

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

// `threshold` defaults to the attendance-punch bound so the existing call site is unaffected;
// login passes FACE_LOGIN_MATCH_THRESHOLD explicitly. Confidence is always reported relative to
// whichever threshold was actually applied, so a displayed number is meaningful against the bar
// that was actually enforced rather than always being read against the looser default.
export function matchFaceDescriptors(live: number[], stored: number[], threshold: number = FACE_MATCH_THRESHOLD): FaceMatchResult {
  const distance = euclideanDistance(live, stored);
  const matched = distance <= threshold;
  const confidence = Math.max(0, Math.round((1 - distance / threshold) * 100));
  return { matched, distance, confidence };
}
