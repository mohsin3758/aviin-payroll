import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { evaluateGeofence } from "@/lib/geo";
import { istDateOnly } from "@/lib/date-ist";
import { isValidDescriptor, matchFaceDescriptors } from "@/lib/face-match";
import type { SessionPayload } from "@/lib/auth";
import type { Attendance } from "@prisma/client";

export interface PunchSession {
  punchIn: string; // ISO
  punchOut: string | null; // ISO, or null while this session is still open
  punchInMethod: string;
  punchOutMethod: string | null;
}

export interface RecordPunchParams {
  employeeId: string;
  action: "in" | "out";
  method: "face" | "manual" | "login";
  /** A 128-number face-api.js descriptor computed client-side from a live camera capture —
   * never a photo. The server never trusts a client-asserted "verified" flag; it always
   * recomputes the match itself against the employee's enrolled FaceEnrollment. */
  faceData?: { descriptor?: unknown };
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

export function parsePunchSessions(raw: string | null): PunchSession[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * A record's session list, backfilled from its legacy top-level punchIn/punchOut for rows
 * created before multi-session support existed (or created entirely via the admin Mark
 * Attendance override, which only ever sets one session). Never mutates the record.
 */
export function effectiveSessions(record: Pick<Attendance, "punchSessions" | "punchIn" | "punchOut" | "punchInMethod" | "punchOutMethod">): PunchSession[] {
  const parsed = parsePunchSessions(record.punchSessions);
  if (parsed.length > 0) return parsed;
  if (!record.punchIn) return [];
  return [
    {
      punchIn: record.punchIn.toISOString(),
      punchOut: record.punchOut ? record.punchOut.toISOString() : null,
      punchInMethod: record.punchInMethod ?? "manual",
      punchOutMethod: record.punchOutMethod ?? null,
    },
  ];
}

export function sumSessionHours(sessions: PunchSession[]): number {
  const totalMs = sessions.reduce((sum, s) => {
    if (!s.punchOut) return sum;
    return sum + (new Date(s.punchOut).getTime() - new Date(s.punchIn).getTime());
  }, 0);
  return Math.round((totalMs / (1000 * 60 * 60)) * 100) / 100;
}

/**
 * Core punch-in/punch-out logic, extracted from the /api/attendance/punch route so the login
 * route (gap 6: login-based attendance) can call the exact same logic instead of duplicating
 * it or making an internal HTTP round-trip to itself.
 *
 * Supports multiple punch-in/punch-out cycles per day (e.g. out for lunch, back in): each
 * punch-in after a *closed* prior session starts a new one rather than being rejected, and
 * totalHours sums every completed session for the day rather than just one in/out span.
 * punchIn/punchOut at the top level keep meaning "first punch-in of the day" / "most recent
 * punch-out of the day" for every existing report/screen that reads them directly; the full
 * history lives in punchSessions.
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

  let faceVerified = false;
  let faceConfidence: number | null = null;

  if (method === "face") {
    if (!isValidDescriptor(faceData?.descriptor)) {
      return { ok: false, status: 400, error: "A live face capture is required for face punch." };
    }
    const enrollment = await db.faceEnrollment.findUnique({ where: { employeeId } });
    if (!enrollment) {
      return { ok: false, status: 400, error: "You haven't enrolled your face yet. Enroll it in My Portal, or use Manual Punch." };
    }
    let storedDescriptor: unknown;
    try {
      storedDescriptor = JSON.parse(enrollment.descriptor);
    } catch {
      storedDescriptor = null;
    }
    if (!isValidDescriptor(storedDescriptor)) {
      return { ok: false, status: 400, error: "Your face enrollment is corrupted — please re-enroll in My Portal." };
    }
    const match = matchFaceDescriptors(faceData.descriptor, storedDescriptor);
    if (!match.matched) {
      return { ok: false, status: 400, error: "Face not recognized. Try again with better lighting, or use Manual Punch." };
    }
    faceVerified = true;
    faceConfidence = match.confidence;
  }

  const company = await db.company.findFirst();

  if (method === "face" && company?.allowFacePunch === false) {
    return { ok: false, status: 400, error: "Face punch is currently disabled. Use manual punch or contact your admin." };
  }
  if (method === "manual" && company?.allowManualPunch === false) {
    return { ok: false, status: 400, error: "Manual punch is currently disabled. Use face punch or contact your admin." };
  }

  // evaluateGeofence itself never rejects on missing punch coordinates (by design — a
  // login/logout-triggered punch never has any) but that same leniency, applied to an
  // interactive face/manual punch, meant enforcement could be silently bypassed just by
  // denying the browser's location permission (or it timing out) — the check would compute
  // "not evaluable" and let the punch through unconditionally. When enforcement is actually
  // on, an interactive punch missing coordinates is treated as a hard requirement, not a skip.
  if (
    method !== "login" &&
    company?.enforceGeofence &&
    company.officeLatitude != null &&
    company.officeLongitude != null &&
    (latitude == null || longitude == null)
  ) {
    return { ok: false, status: 400, error: "Location access is required to punch from here. Please allow location access in your browser and try again." };
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

  const existingRecord = await db.attendance.findUnique({
    where: { employeeId_date: { employeeId, date: today } },
  });

  if (action === "in") {
    const sessions = existingRecord ? effectiveSessions(existingRecord) : [];
    const lastSession = sessions.length > 0 ? sessions[sessions.length - 1] : null;
    if (lastSession && !lastSession.punchOut) {
      return { ok: false, status: 409, error: "Already punched in — punch out first before starting a new session.", data: existingRecord };
    }

    const newSession: PunchSession = { punchIn: now.toISOString(), punchOut: null, punchInMethod: method, punchOutMethod: null };
    const updatedSessions = [...sessions, newSession];

    const record = existingRecord
      ? await db.attendance.update({
          where: { id: existingRecord.id },
          data: {
            punchOut: null,
            faceVerified: faceVerified || existingRecord.faceVerified,
            faceConfidence: faceConfidence ?? existingRecord.faceConfidence,
            status: "present",
            punchSessions: JSON.stringify(updatedSessions),
            ipAddress: ipAddress || existingRecord.ipAddress,
            deviceInfo: deviceInfo || existingRecord.deviceInfo,
            latitude: latitude ?? existingRecord.latitude,
            longitude: longitude ?? existingRecord.longitude,
            locationAccuracy: accuracy ?? existingRecord.locationAccuracy,
            distanceFromOfficeMeters: geofence.distanceMeters ?? existingRecord.distanceFromOfficeMeters,
          },
          include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
        })
      : await db.attendance.create({
          data: {
            employeeId,
            date: today,
            punchIn: now,
            punchInMethod: method,
            faceVerified,
            faceConfidence,
            status: "present",
            punchSessions: JSON.stringify(updatedSessions),
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
      await logAudit({
        session,
        action: existingRecord ? "update" : "create",
        entity: "Attendance",
        entityId: record.id,
        details: { employeeId, punchIn: true, method, sessionNumber: updatedSessions.length },
      });
    }

    return { ok: true, status: existingRecord ? 200 : 201, data: record };
  }

  // --- PUNCH OUT ---
  if (!existingRecord) {
    return { ok: false, status: 404, error: "No punch-in record found for today. Punch in first." };
  }

  const sessions = effectiveSessions(existingRecord);
  const lastIndex = sessions.length - 1;
  if (lastIndex < 0) {
    return { ok: false, status: 404, error: "No punch-in record found for today. Punch in first." };
  }
  if (sessions[lastIndex].punchOut) {
    return { ok: false, status: 409, error: "Already punched out for today.", data: existingRecord };
  }

  sessions[lastIndex] = { ...sessions[lastIndex], punchOut: now.toISOString(), punchOutMethod: method };
  const totalHours = sumSessionHours(sessions);

  const updated = await db.attendance.update({
    where: { id: existingRecord.id },
    data: {
      punchOut: now,
      punchOutMethod: method,
      faceVerified: faceVerified || existingRecord.faceVerified,
      faceConfidence: faceConfidence ?? existingRecord.faceConfidence,
      totalHours,
      punchSessions: JSON.stringify(sessions),
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
