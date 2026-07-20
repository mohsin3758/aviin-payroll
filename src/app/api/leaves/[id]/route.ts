import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/leaves/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const leaveApplication = await db.leaveApplication.findUnique({
    where: { id },
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

  if (!leaveApplication) {
    return NextResponse.json({ error: "Leave application not found" }, { status: 404 });
  }

  return NextResponse.json(leaveApplication);
}

// PUT /api/leaves/[id] - Approve or reject a leave application
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { status, approvedBy } = body;

  if (!["approved", "rejected"].includes(status)) {
    return NextResponse.json({ error: "Invalid status. Must be 'approved' or 'rejected'." }, { status: 400 });
  }

  // Fetch the existing leave application
  const existing = await db.leaveApplication.findUnique({ where: { id } });

  if (!existing) {
    return NextResponse.json({ error: "Leave application not found" }, { status: 404 });
  }

  if (status === "approved") {
    // Update leave application and increment LeaveBalance.used in a transaction
    const result = await db.$transaction(async (tx) => {
      const updated = await tx.leaveApplication.update({
        where: { id },
        data: {
          status: "approved",
          approvedBy: approvedBy ?? null,
          approvedAt: new Date(),
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

      // Determine the year from the leave start date
      const year = updated.startDate.getFullYear();

      // Increment the 'used' field in LeaveBalance
      await tx.leaveBalance.updateMany({
        where: {
          employeeId: updated.employeeId,
          leaveTypeId: updated.leaveTypeId,
          year,
        },
        data: {
          used: {
            increment: updated.totalDays,
          },
        },
      });

      return updated;
    });

    return NextResponse.json(result);
  }

  // Rejected: just set status
  const updated = await db.leaveApplication.update({
    where: { id },
    data: {
      status: "rejected",
      approvedBy: approvedBy ?? null,
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

  return NextResponse.json(updated);
}

// DELETE /api/leaves/[id] - Cancel leave (set status to "cancelled")
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const existing = await db.leaveApplication.findUnique({ where: { id } });

  if (!existing) {
    return NextResponse.json({ error: "Leave application not found" }, { status: 404 });
  }

  const cancelled = await db.leaveApplication.update({
    where: { id },
    data: {
      status: "cancelled",
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

  return NextResponse.json(cancelled);
}