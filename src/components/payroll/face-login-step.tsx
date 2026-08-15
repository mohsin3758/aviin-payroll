'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Loader2, ScanFace, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { loadFaceModels, captureFaceDescriptor } from '@/lib/face-recognition-client';
import { getBestEffortLocation } from '@/lib/geolocation-client';

interface FaceLoginStepProps {
  pendingToken: string;
  enrolled: boolean;
  onSuccess: (user: { id: string; email: string; name: string; role: string; employeeId: string | null }) => void;
  onBack: () => void;
}

// Camera-lifecycle mirrors FaceEnrollmentCard (my-portal-view.tsx) exactly: camera only turns
// on once eligible (immediately for "verify" — consent was already given at original
// enrollment; only after a fresh consent check for "enroll"), and always stops on
// unmount/success/cancel. Renders inline in LoginView's own Card rather than a Dialog, since
// there's no app shell to host one on the pre-login screen.
export default function FaceLoginStep({ pendingToken, enrolled, onSuccess, onBack }: FaceLoginStepProps) {
  const [consent, setConsent] = useState(enrolled); // "verify" mode has nothing left to consent to
  const [cameraReady, setCameraReady] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraReady(false);
  }, []);

  useEffect(() => {
    if (!consent) return;
    let cancelled = false;
    setCameraError(null);
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraReady(true);
      } catch {
        if (!cancelled) setCameraError('Camera access was denied or is unavailable. Check your browser permissions and try again.');
      }
      try {
        await loadFaceModels();
        if (!cancelled) setModelsReady(true);
      } catch {
        if (!cancelled) setCameraError('Failed to load the face recognition models. Check your connection and try again.');
      }
    })();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [consent, stopCamera]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const handleBack = () => {
    stopCamera();
    onBack();
  };

  const handleCapture = async () => {
    if (!videoRef.current) return;
    setSubmitting(true);
    try {
      const result = await captureFaceDescriptor(videoRef.current);
      if (!result.ok) {
        toast.error(
          result.reason === 'no-face' ? 'No face detected — center your face in the frame and try again.'
            : result.reason === 'multiple-faces' ? 'More than one face detected — make sure only you are in frame.'
              : 'Capture failed. Try again.'
        );
        return;
      }

      // Best-effort only — never blocks or delays sign-in on a denied/slow/unsupported prompt.
      // Only ever affects whether a login-triggered auto-punch (if enabled) is geofence-checked.
      const location = await getBestEffortLocation();
      const locationFields = { latitude: location?.latitude ?? null, longitude: location?.longitude ?? null, accuracy: location?.accuracy ?? null };

      const url = enrolled ? '/api/auth/face-login' : '/api/auth/face-login/enroll';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          enrolled
            ? { pendingToken, descriptor: result.descriptor, ...locationFields }
            : { pendingToken, descriptor: result.descriptor, consent: true, ...locationFields }
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Face verification failed');
      stopCamera();
      onSuccess(data.user);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Face verification failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!consent) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-2">
          <p className="flex items-start gap-2"><ShieldCheck className="size-4 shrink-0 mt-0.5 text-emerald-600" />Your company now requires face verification to sign in.</p>
          <p>Your camera only turns on after you consent below. This one-time setup stores a numeric face descriptor — never a photo — which is compared against a fresh capture every time you sign in.</p>
        </div>
        <div className="flex items-start gap-2">
          <Checkbox id="face-login-consent" checked={consent} onCheckedChange={(v) => setConsent(!!v)} />
          <Label htmlFor="face-login-consent" className="cursor-pointer font-normal text-sm">
            I consent to my camera capturing my face for identity verification, and to storing the resulting face descriptor for that purpose.
          </Label>
        </div>
        <div className="flex justify-between">
          <Button type="button" variant="ghost" onClick={handleBack}>Back</Button>
          <Button type="button" disabled={!consent} onClick={() => setConsent(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white">Continue</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium flex items-center gap-2">
        <ScanFace className="size-4 text-emerald-600" />
        {enrolled ? 'Verify your face to finish signing in' : 'Enroll your face to finish signing in'}
      </p>
      <div className="relative w-full aspect-video rounded-lg bg-muted overflow-hidden border">
        <video ref={videoRef} muted playsInline className="w-full h-full object-cover -scale-x-100" />
        {!cameraReady && !cameraError && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground bg-muted/80">
            <Loader2 className="size-5 animate-spin mr-2" />Starting camera…
          </div>
        )}
      </div>
      {cameraError && <p className="text-sm text-red-600">{cameraError}</p>}
      {cameraReady && !modelsReady && !cameraError && (
        <p className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="size-3.5 animate-spin" />Loading face recognition models…</p>
      )}
      <p className="text-xs text-muted-foreground">Look straight at the camera in good lighting, with only your face in frame.</p>
      <div className="flex justify-between">
        <Button type="button" variant="ghost" onClick={handleBack} disabled={submitting}>Back</Button>
        <Button type="button" onClick={handleCapture} disabled={!cameraReady || !modelsReady || submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
          {submitting ? <Loader2 className="size-4 animate-spin" /> : <ScanFace className="size-4" />}
          {enrolled ? 'Verify My Face' : 'Capture & Enroll'}
        </Button>
      </div>
    </div>
  );
}
