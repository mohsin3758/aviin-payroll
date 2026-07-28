import { describe, it, expect } from "vitest";
import { haversineDistanceMeters, evaluateGeofence } from "../geo";

describe("haversineDistanceMeters", () => {
  it("is zero for identical points", () => {
    expect(haversineDistanceMeters(19.076, 72.8777, 19.076, 72.8777)).toBe(0);
  });

  it("matches the well-known ~111km per degree of latitude, within tolerance", () => {
    const distance = haversineDistanceMeters(0, 0, 1, 0);
    expect(distance).toBeGreaterThan(110_000);
    expect(distance).toBeLessThan(112_000);
  });

  it("is symmetric regardless of argument order", () => {
    const a = haversineDistanceMeters(19.076, 72.8777, 28.6139, 77.209);
    const b = haversineDistanceMeters(28.6139, 77.209, 19.076, 72.8777);
    expect(a).toBeCloseTo(b, 6);
  });

  it("handles southern/western (negative) coordinates", () => {
    const distance = haversineDistanceMeters(-33.8688, 151.2093, -37.8136, 144.9631); // Sydney -> Melbourne
    expect(distance).toBeGreaterThan(700_000);
    expect(distance).toBeLessThan(750_000);
  });
});

describe("evaluateGeofence", () => {
  const base = {
    officeLatitude: 19.076,
    officeLongitude: 72.8777,
    geofenceRadiusMeters: 200,
    enforceGeofence: true,
  };

  it("never rejects when office coordinates aren't configured", () => {
    const result = evaluateGeofence({ ...base, officeLatitude: null, officeLongitude: null, latitude: 19.076, longitude: 72.8777 });
    expect(result.distanceMeters).toBeNull();
    expect(result.shouldReject).toBe(false);
  });

  it("never rejects when punch coordinates are missing (e.g. a login-triggered punch)", () => {
    const result = evaluateGeofence({ ...base, latitude: undefined, longitude: undefined });
    expect(result.distanceMeters).toBeNull();
    expect(result.shouldReject).toBe(false);
  });

  it("computes distance but never rejects when no radius is set", () => {
    const result = evaluateGeofence({ ...base, geofenceRadiusMeters: null, latitude: 19.5, longitude: 73.5 });
    expect(result.distanceMeters).not.toBeNull();
    expect(result.shouldReject).toBe(false);
  });

  it("is within the fence and never rejects for a nearby punch", () => {
    const result = evaluateGeofence({ ...base, latitude: 19.0761, longitude: 72.8778 });
    expect(result.withinFence).toBe(true);
    expect(result.shouldReject).toBe(false);
  });

  it("computes an outside-fence distance but does not reject when enforceGeofence is off", () => {
    const result = evaluateGeofence({ ...base, enforceGeofence: false, latitude: 19.5, longitude: 73.5 });
    expect(result.withinFence).toBe(false);
    expect(result.shouldReject).toBe(false);
  });

  it("rejects an outside-fence punch when enforceGeofence is on", () => {
    const result = evaluateGeofence({ ...base, enforceGeofence: true, latitude: 19.5, longitude: 73.5 });
    expect(result.withinFence).toBe(false);
    expect(result.shouldReject).toBe(true);
    expect(result.reason).toBeTruthy();
  });
});
