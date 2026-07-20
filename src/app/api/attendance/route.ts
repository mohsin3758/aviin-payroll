import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/attendance?employeeId=...&month=...&year=...&date=...
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const employeeId = searchParams.get("employeeId");
    const month = searchParams.get("month");
    const year = searchParams.get("year");
    const date = searchParams.get("date");

    const where: Record<string, unknown> = {};

    if (employeeId) {
      where.employeeId = employeeId;
    }

    if (date) {
      // Parse specific date and match the day portion
      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        return NextResponse.json(
          { error: "Invalid date format. Use YYYY-MM-DD." },
          { status: 400 }
        );
      }
      const startOfDay = new Date(date + "T00:00:00.000Z");
      const endOfDay = new Date(date + "T23:59:59.999Z");
      where.date = {
        gte: startOfDay,
        lte: endOfDay,
      };
    } else if (month && year) {
      // Filter by month and year
      const monthNum = parseInt(month, 10);
      const yearNum = parseInt(year, 10);
      if (monthNum < 1 || monthNum > 12 || isNaN(monthNum)) {
        return NextResponse.json(
          { error: "Invalid month. Must be 1-12." },
          { status: 400 }
        );
      }
      if (isNaN(yearNum)) {
        return NextResponse.json(
          { error: "Invalid year." },
          { status: 400 }
        );
      }
      const startDate = new Date(Date.UTC(yearNum, monthNum - 1, 1));
      const endDate = new Date(Date.UTC(yearNum, monthNum, 0, 23, 59, 59, 999));
      where.date = {
        gte: startDate,
        lte: endDate,
      };
    } else if (month) {
      return NextResponse.json(
        { error: "Year is required when filtering by month." },
        { status: 400 }
      );
    }

    const records = await db.attendance.findMany({
      where,
      include: {
        employee: {
          select: {
            firstName: true,
            lastName: true,
            employeeCode: true,
          },
        },
      },
      orderBy: { date: "desc" },
    });

    return NextResponse.json({ data: records });
  } catch (error) {
    console.error("GET /api/attendance error:", error);
    return NextResponse.json(
      { error: "Failed to fetch attendance records." },
      { status: 500 }
    );
  }
}

// POST /api/attendance
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      employeeId,
      date,
      punchIn,
      punchOut,
      punchInMethod,
      punchOutMethod,
      faceVerified,
      faceConfidence,
      status,
      notes,
      ipAddress,
      deviceInfo,
    } = body;

    // Validate required fields
    if (!employeeId) {
      return NextResponse.json(
        { error: "employeeId is required." },
        { status: 400 }
      );
    }

    // Validate faceVerified / faceConfidence
    if (faceVerified === true && faceConfidence === undefined) {
      return NextResponse.json(
        { error: "faceConfidence is required when faceVerified is true." },
        { status: 400 }
      );
    }

    // Determine the attendance date
    const attendanceDate = date
      ? new Date(date)
      : new Date();

    // Normalize to start of day (UTC)
    attendanceDate.setUTCHours(0, 0, 0, 0);

    // Calculate totalHours if both punchIn and punchOut are provided
    let totalHours: number | null = null;
    if (punchIn && punchOut) {
      const inTime = new Date(punchIn);
      const outTime = new Date(punchOut);
      const diffMs = outTime.getTime() - inTime.getTime();
      if (diffMs < 0) {
        return NextResponse.json(
          { error: "punchOut must be after punchIn." },
          { status: 400 }
        );
      }
      totalHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
    }

    // Auto-set status based on punchIn presence
    const resolvedStatus = status || (punchIn ? "present" : "absent");

    // Parse punch times
    const punchInTime = punchIn ? new Date(punchIn) : undefined;
    const punchOutTime = punchOut ? new Date(punchOut) : undefined;

    if (punchOutTime && !punchInTime) {
      // Punch out without punch in: find existing record
      const existingRecord = await db.attendance.findUnique({
        where: {
          employeeId_date: {
            employeeId,
            date: attendanceDate,
          },
        },
      });

      if (!existingRecord) {
        return NextResponse.json(
          { error: "No attendance record found for this employee and date. Punch in first." },
          { status: 404 }
        );
      }

      // Recalculate totalHours
      if (existingRecord.punchIn) {
        const diffMs = punchOutTime.getTime() - existingRecord.punchIn.getTime();
        if (diffMs < 0) {
          return NextResponse.json(
            { error: "punchOut must be after punchIn." },
            { status: 400 }
          );
        }
        totalHours = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
      }

      const updated = await db.attendance.update({
        where: { id: existingRecord.id },
        data: {
          punchOut: punchOutTime,
          punchOutMethod: punchOutMethod || null,
          faceVerified: faceVerified !== undefined ? faceVerified : existingRecord.faceVerified,
          faceConfidence: faceConfidence !== undefined ? faceConfidence : existingRecord.faceConfidence,
          totalHours: totalHours ?? existingRecord.totalHours,
          status: resolvedStatus,
          notes: notes !== undefined ? notes : existingRecord.notes,
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
    }

    // Punch in or full record: upsert
    const record = await db.attendance.upsert({
      where: {
        employeeId_date: {
          employeeId,
          date: attendanceDate,
        },
      },
      create: {
        employeeId,
        date: attendanceDate,
        punchIn: punchInTime,
        punchOut: punchOutTime,
        punchInMethod: punchInMethod || null,
        punchOutMethod: punchOutMethod || null,
        faceVerified: faceVerified ?? false,
        faceConfidence: faceConfidence ?? null,
        status: resolvedStatus,
        totalHours,
        notes: notes || null,
        ipAddress: ipAddress || null,
        deviceInfo: deviceInfo || null,
      },
      update: {
        punchIn: punchInTime || undefined,
        punchOut: punchOutTime ?? undefined,
        punchInMethod: punchInMethod ?? undefined,
        punchOutMethod: punchOutMethod ?? undefined,
        faceVerified: faceVerified !== undefined ? faceVerified : undefined,
        faceConfidence: faceConfidence !== undefined ? faceConfidence : undefined,
        status: resolvedStatus,
        totalHours: totalHours ?? undefined,
        notes: notes !== undefined ? notes : undefined,
        ipAddress: ipAddress !== undefined ? ipAddress : undefined,
        deviceInfo: deviceInfo !== undefined ? deviceInfo : undefined,
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
  } catch (error) {
    console.error("POST /api/attendance error:", error);
    return NextResponse.json(
      { error: "Failed to create or update attendance record." },
      { status: 500 }
    );
  }
}
