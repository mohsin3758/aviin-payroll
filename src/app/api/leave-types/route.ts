import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { createLeaveTypeSchema } from "@/lib/validations/leave-type";
import { logAudit } from "@/lib/audit";

// GET /api/leave-types — every authenticated role can read (employees need this to know what
// leave types exist). ?includeInactive=1 is for the admin CRUD management screen only; everyone
// else only ever sees active types, same "no behavior change until admin opts in" convention
// used throughout this app.
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const includeInactive = request.nextUrl.searchParams.get("includeInactive") === "1";
    const leaveTypes = await db.leaveType.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ data: leaveTypes });
  } catch (error) {
    return handleApiError(error, "fetch leave types");
  }
}

// POST /api/leave-types — admin/hr only.
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const body = await request.json();
    const parsed = createLeaveTypeSchema.parse(body);

    const leaveType = await db.leaveType.create({ data: parsed });
    await logAudit({ session, action: "create", entity: "LeaveType", entityId: leaveType.id, details: parsed });

    return NextResponse.json({ data: leaveType }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "create leave type");
  }
}
