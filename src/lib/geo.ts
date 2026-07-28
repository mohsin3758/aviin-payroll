const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance between two lat/long points, in meters (Haversine formula). */
export function haversineDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

export interface GeofenceInput {
  officeLatitude: number | null;
  officeLongitude: number | null;
  geofenceRadiusMeters: number | null;
  enforceGeofence: boolean;
  latitude: number | null | undefined;
  longitude: number | null | undefined;
}

export interface GeofenceResult {
  distanceMeters: number | null;
  withinFence: boolean | null;
  shouldReject: boolean;
  reason?: string;
}

/**
 * Never rejects a punch it can't evaluate: missing office coordinates (not configured yet) or
 * missing punch coordinates (permission denied, unsupported browser, or a "login"-triggered
 * punch, which never has coordinates at all) both mean "not computable" rather than "reject."
 * Enforcement additionally requires enforceGeofence to be explicitly turned on — configuring
 * an office location and radius alone only ever logs distance, never blocks anything.
 */
export function evaluateGeofence(input: GeofenceInput): GeofenceResult {
  const { officeLatitude, officeLongitude, geofenceRadiusMeters, enforceGeofence, latitude, longitude } = input;

  if (officeLatitude == null || officeLongitude == null || latitude == null || longitude == null) {
    return { distanceMeters: null, withinFence: null, shouldReject: false };
  }

  const distanceMeters = haversineDistanceMeters(officeLatitude, officeLongitude, latitude, longitude);

  if (geofenceRadiusMeters == null) {
    return { distanceMeters, withinFence: null, shouldReject: false };
  }

  const withinFence = distanceMeters <= geofenceRadiusMeters;
  if (withinFence || !enforceGeofence) {
    return { distanceMeters, withinFence, shouldReject: false };
  }

  return {
    distanceMeters,
    withinFence,
    shouldReject: true,
    reason: `You're ${Math.round(distanceMeters)}m from the office — outside the allowed ${geofenceRadiusMeters}m radius.`,
  };
}
