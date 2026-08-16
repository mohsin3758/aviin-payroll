import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiError, handleApiError } from "@/lib/api-utils";
import { requirePayrollFeature, filterToScope } from "@/lib/payroll-access";
import { logAudit } from "@/lib/audit";

type Params = {
  params: Promise<{ runId: string }>;
};

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["processed"],
  processed: ["paid"],
  paid: [],
};

// GET /api/payroll/[runId] - Get a payroll run with all details
export async function GET(request: NextRequest, { params }: Params) {
  try {
    // Returns full bank/PAN/Aadhaar + salary detail for every employee in the run — matches
    // its bank-file sibling and the payroll list route: admin/hr only, not self-or-manager.
    const { restriction } = await requirePayrollFeature(request, ["admin", "hr"], "view_payroll");
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
      return apiError("Payroll run not found", 404);
    }

    // An employee-scoped hr user only sees the run's rows for their assigned employees — the
    // run-level aggregates (totalGrossSalary etc.) still reflect the whole company; see the
    // called-out limitation in the plan for GET /api/payroll's list view.
    return NextResponse.json({ ...payrollRun, details: filterToScope(restriction, payrollRun.details) });
  } catch (error) {
    return handleApiError(error, "fetch payroll run");
  }
}

// PUT /api/payroll/[runId] - Update payroll run status
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const { session } = await requirePayrollFeature(request, ["admin", "hr"], "process_payroll");
    const { runId } = await params;
    const body = await request.json();
    const { status } = body;

    if (!status || !["draft", "processed", "paid"].includes(status)) {
      return apiError("Invalid status. Must be one of: draft, processed, paid", 400);
    }

    const existing = await db.payrollRun.findUnique({
      where: { id: runId },
    });

    if (!existing) {
      return apiError("Payroll run not found", 404);
    }

    // Validate status transition
    const allowedTransitions = VALID_TRANSITIONS[existing.status] || [];
    if (!allowedTransitions.includes(status)) {
      return apiError(
        `Cannot transition from "${existing.status}" to "${status}". Allowed: ${allowedTransitions.join(", ") || "none"}`,
        400
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

    await logAudit({
      session,
      action: "update",
      entity: "PayrollRun",
      entityId: runId,
      details: { fromStatus: existing.status, toStatus: status },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, "update payroll run");
  }
}
