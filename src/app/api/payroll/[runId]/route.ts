import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

type Params = {
  params: Promise<{ runId: string }>;
};

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["processed"],
  processed: ["paid"],
  paid: [],
};

// GET /api/payroll/[runId] - Get a payroll run with all details
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { runId } = await params;

    const payrollRun = await db.payrollRun.findUnique({
      where: { id: runId },
      include: {
        details: {
          include: {
            employee: true,
          },
          orderBy: {
            employee: {
              employeeCode: "asc",
            },
          },
        },
      },
    });

    if (!payrollRun) {
      return NextResponse.json(
        { error: "Payroll run not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(payrollRun);
  } catch (error) {
    console.error("Error fetching payroll run:", error);
    return NextResponse.json(
      { error: "Failed to fetch payroll run" },
      { status: 500 }
    );
  }
}

// PUT /api/payroll/[runId] - Update payroll run status
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { runId } = await params;
    const body = await request.json();
    const { status } = body;

    if (!status || !["draft", "processed", "paid"].includes(status)) {
      return NextResponse.json(
        { error: "Invalid status. Must be one of: draft, processed, paid" },
        { status: 400 }
      );
    }

    const existing = await db.payrollRun.findUnique({
      where: { id: runId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Payroll run not found" },
        { status: 404 }
      );
    }

    // Validate status transition
    const allowedTransitions = VALID_TRANSITIONS[existing.status] || [];
    if (!allowedTransitions.includes(status)) {
      return NextResponse.json(
        {
          error: `Cannot transition from "${existing.status}" to "${status}". Allowed: ${allowedTransitions.join(", ") || "none"}`,
        },
        { status: 400 }
      );
    }

    const updated = await db.payrollRun.update({
      where: { id: runId },
      data: { status },
      include: {
        details: {
          include: {
            employee: true,
          },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating payroll run:", error);
    return NextResponse.json(
      { error: "Failed to update payroll run" },
      { status: 500 }
    );
  }
}