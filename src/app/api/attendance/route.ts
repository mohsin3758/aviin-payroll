import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Prisma, PrismaClient } from "@prisma/client";
import { requireRole, scopeToOwnEmployeeIfSelf } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

type TxClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

/** Half-day attendance consumes 0.5 day of leave balance — this picks which leave type to charge. */
async function getDefaultHalfDayLeaveTypeId(tx: TxClient): Promise<string | null> {
  const cl = await tx.leaveType.findFirst({ where: { shortCode: "CL" } });
  if (cl) return cl.id;
  const any = await tx.leaveType.findFirst({ orderBy: { name: "asc" } });
  return any?.id ?? null;
}

/**
 * Applies the leave-balance delta for a half-day status transition. No-op unless the
 * status is actually changing into or out of "half-day" (idempotent against re-saves).
 */
async function applyHalfDayLeaveDelta(
  tx: TxClient,
  employeeId: string,
  date: Date,
  oldStatus: string | null,
  newStatus: string
) {
  const wasHalfDay = oldStatus === "half-day";
  const isHalfDay = newStatus === "half-day";
  if (wasHalfDay === isHalfDay) return;

  const leaveTypeId = await getDefaultHalfDayLeaveTypeId(tx);
  if (!leaveTypeId) return;

  const year = date.getFullYear();
  const delta = isHalfDay ? 0.5 : -0.5;

  await tx.leaveBalance.updateMany({
    where: { employeeId, leaveTypeId, year },
    data: { used: { increment: delta } },
  });
}

// GET /api/attendance?employeeId=...&month=...&year=...&date=...
export async function GET(request: NextRequest) {
  try {
    // employee role: silently restricted to their own records rather than 403ing, since this
    // same shared page is also where an employee comes to view/punch their own attendance.
    const { forcedEmployeeId } = await scopeToOwnEmployeeIfSelf(request);
    const { searchParams } = new URL(request.url);
    const limit = Math.min(2000, Math.max(1, parseInt(searchParams.get("limit") ?? "1000", 10) || 1000));
    const employeeId = searchParams.get("employeeId");
    const month = searchParams.get("month");
    const year = searchParams.get("year");
    const date = searchParams.get("date");

    const where: Record<string, unknown> = {};

    if (forcedEmployeeId) {
      where.employeeId = forcedEmployeeId;
    } else if (employeeId) {
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
      take: limit,
    });

    return NextResponse.json({ data: records });
  } catch (error) {
    return handleApiError(error, "fetch attendance records");
  }
}

// POST /api/attendance
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin", "hr", "manager"]);
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
      return apiError("employeeId is required.", 400);
    }

    const employee = await db.employee.findUnique({ where: { id: employeeId } });
    if (!employee) {
      return apiError("Employee not found.", 404);
    }
    if (employee.dateOfExit) {
      return apiError("Cannot record attendance for an exited employee.", 400);
    }

    // Validate faceVerified / faceConfidence
    if (faceVerified === true && faceConfidence === undefined) {
      return apiError("faceConfidence is required when faceVerified is true.", 400);
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

      const updated = await db.$transaction(async (tx) => {
        const rec = await tx.attendance.update({
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
        await applyHalfDayLeaveDelta(tx, employeeId, attendanceDate, existingRecord.status, resolvedStatus);
        return rec;
      });

      return NextResponse.json({ data: updated }, { status: 200 });
    }

    // Punch in or full record: upsert
    const existingForUpsert = await db.attendance.findUnique({
      where: { employeeId_date: { employeeId, date: attendanceDate } },
    });

    const record = await db.$transaction(async (tx) => {
      const rec = await tx.attendance.upsert({
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
      await applyHalfDayLeaveDelta(tx, employeeId, attendanceDate, existingForUpsert?.status ?? null, resolvedStatus);
      return rec;
    });

    await logAudit({
      session,
      action: "create",
      entity: "Attendance",
      entityId: record.id,
      details: { employeeId, date: attendanceDate.toISOString(), status: resolvedStatus },
    });

    return NextResponse.json({ data: record }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "create or update attendance record");
  }
}
