import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole, requireSelfOrRole } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

const assignSchema = z.object({ shiftId: z.string().min(1) });

// GET /api/employees/[id]/shift — the employee's current (most recent) shift assignment.
// Operational scheduling data, not financial — self, or admin/hr/manager (same tier as
// attendance/leave oversight).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireSelfOrRole(request, id, ["admin", "hr", "manager"]);
    const assignment = await db.employeeShift.findFirst({
      where: { employeeId: id },
      include: { shift: true },
      orderBy: { effectiveFrom: "desc" },
    });
    return NextResponse.json({ data: assignment });
  } catch (error) {
    return handleApiError(error, "fetch employee shift");
  }
}

// POST /api/employees/[id]/shift — admin/hr only, assigns a shift effective now.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id } = await params;
    const body = await request.json();
    const { shiftId } = assignSchema.parse(body);

    const [employee, shift] = await Promise.all([
      db.employee.findUnique({ where: { id } }),
      db.shift.findUnique({ where: { id: shiftId } }),
    ]);
    if (!employee) return apiError("Employee not found", 404);
    if (!shift) return apiError("Shift not found", 404);

    const assignment = await db.employeeShift.create({ data: { employeeId: id, shiftId }, include: { shift: true } });
    await logAudit({ session, action: "create", entity: "EmployeeShift", entityId: assignment.id });

    return NextResponse.json({ data: assignment }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "assign shift");
  }
}
