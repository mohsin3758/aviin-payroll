import { NextRequest, NextResponse } from "next/server";
import { requireSelfOrRole } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { recordPunch } from "@/lib/attendance-punch";

// POST /api/attendance/punch
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { employeeId, action, method, faceData, ipAddress, deviceInfo, latitude, longitude, accuracy } = body;

    if (!employeeId) {
      return apiError("employeeId is required.", 400);
    }
    if (!action || !["in", "out"].includes(action)) {
      return apiError("action is required and must be 'in' or 'out'.", 400);
    }
    if (!method || !["face", "manual", "login"].includes(method)) {
      return apiError("method is required and must be 'face', 'manual', or 'login'.", 400);
    }

    // Anyone may punch for themselves; only admin/hr/manager may punch on behalf of someone else.
    const session = await requireSelfOrRole(request, employeeId, ["admin", "hr", "manager"]);

    const result = await recordPunch({
      employeeId,
      action,
      method,
      faceData,
      ipAddress: ipAddress || null,
      deviceInfo: deviceInfo || null,
      latitude: typeof latitude === "number" ? latitude : null,
      longitude: typeof longitude === "number" ? longitude : null,
      accuracy: typeof accuracy === "number" ? accuracy : null,
      session,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error, data: result.data }, { status: result.status });
    }
    return NextResponse.json({ data: result.data }, { status: result.status });
  } catch (error) {
    return handleApiError(error, "process punch");
  }
}
