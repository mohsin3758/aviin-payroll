'use client';

// Browser-only face detection/recognition, backed by @vladmandic/face-api (a TensorFlow.js
// wrapper) running entirely client-side — model weights are self-hosted under /public/models,
// never a CDN. Nothing here ever leaves the browser except the final 128-number descriptor,
// which callers send to the server for matching; the actual photo/video frame never does.
//
// Always dynamically imported (`await import(...)`) from a client component event handler or
// effect, never at module top-level — face-api.js touches browser-only APIs that don't exist
// during Next.js's server-side render.

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

export type FaceCaptureResult =
  | { ok: true; descriptor: number[] }
  | { ok: false; reason: 'no-face' | 'multiple-faces' | 'error' | 'timeout' };

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
