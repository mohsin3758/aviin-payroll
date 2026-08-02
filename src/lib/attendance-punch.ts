import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { evaluateGeofence } from "@/lib/geo";
import { istDateOnly } from "@/lib/date-ist";
import type { SessionPayload } from "@/lib/auth";

export interface RecordPunchParams {
  employeeId: string;
  action: "in" | "out";
  method: "face" | "manual" | "login";
  faceData?: { verified?: boolean; confidence?: number };
  ipAddress?: string | null;
  deviceInfo?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  /** Present for an interactively-triggered punch (face/manual); absent for the login hook,
   * which has no request-scoped session helper to call from — audit logging is best-effort
   * there and keyed off the employee/user data the caller already has. */
  session?: SessionPayload;
}

export type RecordPunchResult =
  | { ok: true; status: 201 | 200; data: unknown }
  | { ok: false; status: 400 | 404 | 409; error: string; data?: unknown };

/**
 * Core punch-in/punch-out logic, extracted from the /api/attendance/punch route so the login
 * route (gap 6: login-based attendance) can call the exact same logic instead of duplicating
 * it or making an internal HTTP round-trip to itself.
 */
export async function recordPunch(params: RecordPunchParams): Promise<RecordPunchResult> {
  const { employeeId, action, method, faceData, ipAddress, deviceInfo, latitude, longitude, accuracy, session } = params;

  const employee = await db.employee.findUnique({ where: { id: employeeId } });
  if (!employee) {
    return { ok: false, status: 404, error: "Employee not found." };
  }
  if (employee.dateOfExit) {
    return { ok: false, status: 400, error: "Cannot record attendance for an exited employee." };
  }

  const faceVerified = faceData?.verified === true;
  let faceConfidence: number | null = null;

  if (method === "face") {
    if (!faceData || !faceData.verified) {
      return { ok: false, status: 400, error: "Face data with verified=true is required for face method." };
    }
    if (typeof faceData.confidence !== "number" || faceData.confidence < 0) {
      return { ok: false, status: 400, error: "faceData.confidence must be a non-negative number." };
    }
    faceConfidence = faceData.confidence;
  }

  const company = await db.company.findFirst();

  if (method === "face" && company?.allowFacePunch === false) {
    return { ok: false, status: 400, error: "Face punch is currently disabled. Use manual punch or contact your admin." };
  }
  if (method === "manual" && company?.allowManualPunch === false) {
    return { ok: false, status: 400, error: "Manual punch is currently disabled. Use face punch or contact your admin." };
  }

  const geofence = evaluateGeofence({
    officeLatitude: company?.officeLatitude ?? null,
    officeLongitude: company?.officeLongitude ?? null,
    geofenceRadiusMeters: company?.geofenceRadiusMeters ?? null,
    enforceGeofence: company?.enforceGeofence ?? false,
    latitude,
    longitude,
  });
  if (geofence.shouldReject) {
    return { ok: false, status: 400, error: geofence.reason ?? "Outside the allowed punch location." };
  }

  const today = istDateOnly();
  const now = new Date();

  if (action === "in") {
    const existingRecord = await db.attendance.findUnique({
      where: { employeeId_date: { employeeId, date: today } },
    });
    if (existingRecord) {
      return { ok: false, status: 409, error: "Already punched in for today.", data: existingRecord };
    }

    const record = await db.attendance.create({
      data: {
        employeeId,
        date: today,
        punchIn: now,
        punchInMethod: method,
        faceVerified,
        faceConfidence,
        status: "present",
        ipAddress: ipAddress || null,
        deviceInfo: deviceInfo || null,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        locationAccuracy: accuracy ?? null,
        distanceFromOfficeMeters: geofence.distanceMeters,
      },
      include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
    });

    if (session) {
      await logAudit({ session, action: "create", entity: "Attendance", entityId: record.id, details: { employeeId, punchIn: true, method } });
    }

    return { ok: true, status: 201, data: record };
  }

  // --- PUNCH OUT ---
  const existingRecord = await db.attendance.findUnique({
    where: { employeeId_date: { employeeId, date: today } },
  });

  if (!existingRecord) {
    return { ok: false, status: 404, error: "No punch-in record found for today. Punch in first." };
  }
  if (existingRecord.punchOut) {
    return { ok: false, status: 409, error: "Already punched out for today.", data: existingRecord };
  }
  if (!existingRecord.punchIn) {
    return { ok: false, status: 400, error: "Existing record has no punch-in time. Data is inconsistent." };
  }

  const diffMs = now.getTime() - existingRecord.punchIn.getTime();
  const totalHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;

  const updated = await db.attendance.update({
    where: { id: existingRecord.id },
    data: {
      punchOut: now,
      punchOutMethod: method,
      faceVerified: faceVerified || existingRecord.faceVerified,
      faceConfidence: faceConfidence ?? existingRecord.faceConfidence,
      totalHours,
      ipAddress: ipAddress || existingRecord.ipAddress,
      deviceInfo: deviceInfo || existingRecord.deviceInfo,
      latitude: latitude ?? existingRecord.latitude,
      longitude: longitude ?? existingRecord.longitude,
      locationAccuracy: accuracy ?? existingRecord.locationAccuracy,
      distanceFromOfficeMeters: geofence.distanceMeters ?? existingRecord.distanceFromOfficeMeters,
    },
    include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
  });

  if (session) {
    await logAudit({ session, action: "update", entity: "Attendance", entityId: updated.id, details: { employeeId, punchOut: true, method } });
  }

  return { ok: true, status: 200, data: updated };
}
