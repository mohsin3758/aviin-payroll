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
  | { ok: false; reason: 'no-face' | 'multiple-faces' | 'error' };

/** Runs detection + landmark alignment + descriptor extraction on the video element's current
 * frame. Requires loadFaceModels() to have already resolved. */
export async function captureFaceDescriptor(video: HTMLVideoElement): Promise<FaceCaptureResult> {
  try {
    const faceapi = await import('@vladmandic/face-api');
    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptors();

    if (detections.length === 0) return { ok: false, reason: 'no-face' };
    if (detections.length > 1) return { ok: false, reason: 'multiple-faces' };

    return { ok: true, descriptor: Array.from(detections[0].descriptor) };
  } catch (err) {
    console.error('[face-recognition] capture failed:', err);
    return { ok: false, reason: 'error' };
  }
}
