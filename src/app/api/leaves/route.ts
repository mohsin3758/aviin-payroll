import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/leaves?types or /api/leaves?employeeId=...&status=...&year=...
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  // If "types" query param is present, return all leave types
  if (searchParams.has("types")) {
    const leaveTypes = await db.leaveType.findMany({
      orderBy: { name: "asc" },
    });
    return NextResponse.json(leaveTypes);
  }

  // Otherwise return leave applications with optional filters
  const employeeId = searchParams.get("employeeId");
  const status = searchParams.get("status");
  const yearParam = searchParams.get("year");

  const where: Record<string, unknown> = {};

  if (employeeId) {
    where.employeeId = employeeId;
  }

  if (status) {
    where.status = status;
  }

  if (yearParam) {
    const year = parseInt(yearParam, 10);
    where.startDate = {
      gte: new Date(year, 0, 1),
      lt: new Date(year + 1, 0, 1),
    };
  }

  const leaveApplications = await db.leaveApplication.findMany({
    where,
    include: {
      employee: {
        select: {
          firstName: true,
          lastName: true,
          employeeCode: true,
        },
      },
      leaveType: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(leaveApplications);
}

// POST /api/leaves - Create a leave application
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { employeeId, leaveTypeId, startDate, endDate, reason } = body;

  // Calculate totalDays from startDate to endDate (inclusive)
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = Math.abs(end.getTime() - start.getTime());
  const totalDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1;

  const leaveApplication = await db.leaveApplication.create({
    data: {
      employeeId,
      leaveTypeId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      totalDays,
      reason: reason ?? null,
      status: "pending",
    },
    include: {
      employee: {
        select: {
          firstName: true,
          lastName: true,
          employeeCode: true,
        },
      },
      leaveType: true,
    },
  });

  return NextResponse.json(leaveApplication, { status: 201 });
}