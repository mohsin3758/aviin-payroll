import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/attendance/punch
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { employeeId, action, method, faceData, ipAddress, deviceInfo } = body;

    // Validate required fields
    if (!employeeId) {
      return NextResponse.json(
        { error: "employeeId is required." },
        { status: 400 }
      );
    }

    if (!action || !["in", "out"].includes(action)) {
      return NextResponse.json(
        { error: "action is required and must be 'in' or 'out'." },
        { status: 400 }
      );
    }

    if (!method || !["face", "manual", "login"].includes(method)) {
      return NextResponse.json(
        { error: "method is required and must be 'face', 'manual', or 'login'." },
        { status: 400 }
      );
    }

    // Auto-set date to today (start of day UTC)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const now = new Date();

    // Validate face data if method is "face"
    const faceVerified = faceData?.verified === true;
    let faceConfidence: number | null = null;

    if (method === "face") {
      if (!faceData || !faceData.verified) {
        return NextResponse.json(
          { error: "Face verification failed. Face data with verified=true is required for face method." },
          { status: 400 }
        );
      }
      if (typeof faceData.confidence !== "number" || faceData.confidence < 0) {
        return NextResponse.json(
          { error: "faceData.confidence must be a non-negative number." },
          { status: 400 }
        );
      }
      faceConfidence = faceData.confidence;
    }

    if (faceVerified && faceConfidence === null) {
      return NextResponse.json(
        { error: "faceConfidence is required when faceVerified is true." },
        { status: 400 }
      );
    }

    // --- PUNCH IN ---
    if (action === "in") {
      // Check if a record already exists for today
      const existingRecord = await db.attendance.findUnique({
        where: {
          employeeId_date: {
            employeeId,
            date: today,
          },
        },
      });

      if (existingRecord) {
        return NextResponse.json(
          { error: "Already punched in for today.", data: existingRecord },
          { status: 409 }
        );
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
        },
        include: {
          employee: {
            select: {
              firstName: true,
              lastName: true,
              employeeCode: true,
            },
          },
        },
      });

      return NextResponse.json({ data: record }, { status: 201 });
    }

    // --- PUNCH OUT ---
    const existingRecord = await db.attendance.findUnique({
      where: {
        employeeId_date: {
          employeeId,
          date: today,
        },
      },
    });

    if (!existingRecord) {
      return NextResponse.json(
        { error: "No punch-in record found for today. Punch in first." },
        { status: 404 }
      );
    }

    if (existingRecord.punchOut) {
      return NextResponse.json(
        { error: "Already punched out for today.", data: existingRecord },
        { status: 409 }
      );
    }

    if (!existingRecord.punchIn) {
      return NextResponse.json(
        { error: "Existing record has no punch-in time. Data is inconsistent." },
        { status: 400 }
      );
    }

    // Calculate total hours
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
      },
      include: {
        employee: {
          select: {
            firstName: true,
            lastName: true,
            employeeCode: true,
          },
        },
      },
    });

    return NextResponse.json({ data: updated }, { status: 200 });
  } catch (error) {
    console.error("POST /api/attendance/punch error:", error);
    return NextResponse.json(
      { error: "Failed to process punch." },
      { status: 500 }
    );
  }
}
