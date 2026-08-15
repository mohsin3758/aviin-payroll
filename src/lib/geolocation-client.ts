export interface BestEffortLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
}

/**
 * Best-effort browser geolocation for login-time geofence checks — never blocks or fails the
 * caller. Resolves null (not a rejected promise) on missing API support, denied permission,
 * timeout, or any other error, so a slow/denied location prompt never delays signing in; the
 * server-side geofence check already treats missing coordinates as "not evaluable" rather than
 * a hard failure for login-triggered punches (see src/lib/attendance-punch.ts).
 */
export function getBestEffortLocation(timeoutMs = 4000): Promise<BestEffortLocation | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    let settled = false;
    const finish = (value: BestEffortLocation | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timer);
        finish({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      () => {
        clearTimeout(timer);
        finish(null);
      },
      { timeout: timeoutMs, maximumAge: 60_000 }
    );
  });
}
