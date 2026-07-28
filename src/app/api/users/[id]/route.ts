import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateUserSchema } from "@/lib/validations/user";
import { apiError, handleApiError } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  active: true,
  employeeId: true,
  employee: { select: { firstName: true, lastName: true, employeeCode: true } },
  createdAt: true,
} as const;

// PUT /api/users/[id] — admin only, toggles active/role, or links/unlinks the login to an
// Employee record, for ANOTHER user. Self-modification is blocked so an admin can never lock
// themselves out.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin"]);
    const { id } = await params;

    if (id === session.userId) {
      return apiError("Use your own account settings to manage yourself, not this endpoint.", 400);
    }

    const body = await request.json();
    const parsed = updateUserSchema.parse(body);

    const existing = await db.user.findUnique({ where: { id } });
    if (!existing) {
      return apiError("User not found", 404);
    }

    // "employeeId" in parsed but falsy (null) means "unlink" — only run the exists/uniqueness
    // checks when actually linking to a specific record.
    if (parsed.employeeId) {
      const employee = await db.employee.findUnique({ where: { id: parsed.employeeId } });
      if (!employee) {
        return apiError("Employee not found.", 404);
      }
      const alreadyLinked = await db.user.findUnique({ where: { employeeId: parsed.employeeId } });
      if (alreadyLinked && alreadyLinked.id !== id) {
        return apiError("This employee already has a portal login.", 409);
      }
    }

    const user = await db.user.update({
      where: { id },
      data: parsed,
      select: userSelect,
    });

    await logAudit({ session, action: "update", entity: "User", entityId: id, details: parsed });

    return NextResponse.json({ data: user });
  } catch (error) {
    return handleApiError(error, "update user");
  }
}
