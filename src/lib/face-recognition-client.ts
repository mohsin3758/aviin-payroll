'use client';

// Browser-only face detection/recognition, backed by @vladmandic/face-api (a TensorFlow.js
// wrapper) running entirely client-side — model weights are self-hosted under /public/models,
// never a CDN. Nothing here ever leaves the browser except the final 128-number descriptor,
// which callers send to the server for matching; the actual photo/video frame never does.
//
// Always dynamically imported (`await import(...)`) from a client component event handler or
// effect, never at module top-level — face-api.js touches browser-only APIs that don't exist
// during Next.js's server-side render.

import { euclideanDistance, FACE_DESCRIPTOR_LENGTH } from '@/lib/face-match';

const MODEL_URL = '/models';

let modelsLoadedPromise: Promise<void> | null = null;

export async function loadFaceModels(): Promise<void> {
  if (!modelsLoadedPromise) {
    modelsLoadedPromise = (async () => {
      const faceapi = await import('@vladmandic/face-api');
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
    })();
  }
  return modelsLoadedPromise;
}

// getUserMedia() rejects with a DOMException whose `name` distinguishes the actual cause — but
// every caller was catching it with a bare `catch {}` and showing one generic "denied or
// unavailable" message regardless, which made a granted-permission-but-still-failing case (e.g.
// the camera already locked by another app) indistinguishable from an actual OS/browser denial.
// Logging the raw error and mapping `name` to a specific message makes each case self-diagnosing.
export function describeCameraError(err: unknown, cta = 'Try again.'): string {
  console.error('[camera] getUserMedia failed:', err);
  const name = err instanceof DOMException ? err.name : undefined;
  const reason =
    name === 'NotAllowedError' || name === 'SecurityError'
      ? 'Camera access was denied. Check your browser and OS camera permissions.'
      : name === 'NotFoundError' || name === 'OverconstrainedError'
        ? 'No camera was found on this device.'
        : name === 'NotReadableError' || name === 'TrackStartError'
          ? 'The camera is already in use by another app or browser tab (e.g. Zoom, Teams). Close it.'
          : name === 'AbortError'
            ? 'Camera failed to start.'
            : 'Camera access was denied or is unavailable.';
  return `${reason} ${cta}`;
}

export type FaceCaptureResult =
  | { ok: true; descriptor: number[] }
  | { ok: false; reason: 'no-face' | 'multiple-faces' | 'error' | 'timeout' | 'inconsistent' };

// How long to wait for the in-browser TensorFlow.js detection pipeline before giving up.
// Without this, a stalled WebGL context, a backgrounded tab throttling requestAnimationFrame, or
// a bad video frame leaves the detection promise unresolved forever — the caller's "Confirming..."
// UI would spin indefinitely with no way out except closing the dialog.
export const FACE_DETECTION_TIMEOUT_MS = 12000;

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

/** Runs detection + landmark alignment + descriptor extraction on the video element's current
 * frame. Requires loadFaceModels() to have already resolved. Bounded by FACE_DETECTION_TIMEOUT_MS
 * so a stalled detection fails fast instead of hanging the caller's UI forever. */
export async function captureFaceDescriptor(video: HTMLVideoElement): Promise<FaceCaptureResult> {
  try {
    const faceapi = await import('@vladmandic/face-api');
    // face-api.js's chained task builder is a thenable but not a real Promise (its .then
    // signature doesn't structurally match PromiseLike well enough for Promise.race) — wrapping
    // in an async IIFE normalizes it to a genuine Promise before racing it against the timeout.
    const detections = await withTimeout(
      (async () =>
        faceapi
          .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks()
          .withFaceDescriptors())(),
      FACE_DETECTION_TIMEOUT_MS
    );

    if (detections.length === 0) return { ok: false, reason: 'no-face' };
    if (detections.length > 1) return { ok: false, reason: 'multiple-faces' };

    return { ok: true, descriptor: Array.from(detections[0].descriptor) };
  } catch (err) {
    if (err instanceof Error && err.message === 'timeout') {
      console.error('[face-recognition] capture timed out');
      return { ok: false, reason: 'timeout' };
    }
    console.error('[face-recognition] capture failed:', err);
    return { ok: false, reason: 'error' };
  }
}

// How many frames to capture for enrollment, and how far apart to space them. A single-frame
// enrollment stores whatever that one moment happened to look like (a stray shadow, a slight
// blink, motion blur) as the permanent reference — every future login/punch is judged against
// that one snapshot forever. Averaging several frames from a short live session smooths out
// that per-frame noise, closer to how Face ID keeps refining its stored model over many captures
// instead of trusting a single enrollment shot.
const ENROLLMENT_FRAME_COUNT = 3;
const ENROLLMENT_FRAME_INTERVAL_MS = 350;

// How far apart two frames from the *same* enrollment session are allowed to be. This is much
// tighter than FACE_MATCH_THRESHOLD/FACE_LOGIN_MATCH_THRESHOLD (face-match.ts) — those bound
// "is this the same person, possibly minutes/days apart, under different lighting," while this
// bounds "did these three frames, captured half a second apart, actually agree with each other."
// A wide spread here means something went wrong mid-capture (movement, a lighting flicker, the
// camera refocusing) rather than genuine person-to-person variation, and the capture should be
// rejected and retried rather than silently averaged into a muddled descriptor.
const ENROLLMENT_CONSISTENCY_THRESHOLD = 0.3;

/** Only for enrollment (never for login/punch verification, which stays single-frame for speed).
 * Captures ENROLLMENT_FRAME_COUNT frames a short interval apart, rejects the capture if the
 * frames don't agree closely with each other, and returns the per-dimension average descriptor —
 * a steadier reference than any single frame, reducing how often a good-faith enrollment produces
 * a descriptor that later fails to match the same person's live face. */
export async function captureFaceDescriptorForEnrollment(
  video: HTMLVideoElement,
  onProgress?: (frame: number, total: number) => void
): Promise<FaceCaptureResult> {
  const descriptors: number[][] = [];
  for (let i = 0; i < ENROLLMENT_FRAME_COUNT; i++) {
    onProgress?.(i + 1, ENROLLMENT_FRAME_COUNT);
    const result = await captureFaceDescriptor(video);
    if (!result.ok) return result;
    descriptors.push(result.descriptor);
    if (i < ENROLLMENT_FRAME_COUNT - 1) {
      await new Promise((resolve) => setTimeout(resolve, ENROLLMENT_FRAME_INTERVAL_MS));
    }
  }

  for (let i = 0; i < descriptors.length; i++) {
    for (let j = i + 1; j < descriptors.length; j++) {
      if (euclideanDistance(descriptors[i], descriptors[j]) > ENROLLMENT_CONSISTENCY_THRESHOLD) {
        return { ok: false, reason: 'inconsistent' };
      }
    }
  }

  const averaged = new Array(FACE_DESCRIPTOR_LENGTH).fill(0);
  for (const d of descriptors) {
    for (let k = 0; k < FACE_DESCRIPTOR_LENGTH; k++) averaged[k] += d[k];
  }
  for (let k = 0; k < FACE_DESCRIPTOR_LENGTH; k++) averaged[k] /= descriptors.length;

  return { ok: true, descriptor: averaged };
}
