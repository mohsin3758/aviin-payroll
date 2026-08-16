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

    if (parsed.email && parsed.email !== existing.email) {
      const emailTaken = await db.user.findUnique({ where: { email: parsed.email } });
      if (emailTaken) {
        return apiError("A user with this email already exists.", 409);
      }
    }

    // Demoting the last remaining active admin would lock everyone out with no way back in —
    // same reasoning as the delete guard below, just triggered by a role change instead.
    if (parsed.role && parsed.role !== "admin" && existing.role === "admin") {
      const otherAdmins = await db.user.count({ where: { role: "admin", active: true, id: { not: id } } });
      if (otherAdmins === 0) {
        return apiError("Cannot change the role of the last remaining admin account.", 409);
      }
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

// DELETE /api/users/[id] — admin only, permanently removes a login account. Self-deletion is
// blocked (same reasoning as PUT — an admin must never be able to lock themselves out), and
// deleting the last remaining admin account is blocked too, since that would lock EVERYONE out
// with no way back in. This only removes the login — a linked Employee record (if any) is
// completely untouched, so "delete this person's portal access" never means "delete the
// employee." PasswordResetToken rows are cleaned up first since they FK into User.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin"]);
    const { id } = await params;

    if (id === session.userId) {
      return apiError("You cannot delete your own account.", 400);
    }

    const existing = await db.user.findUnique({ where: { id } });
    if (!existing) {
      return apiError("User not found", 404);
    }

    if (existing.role === "admin") {
      const otherAdmins = await db.user.count({ where: { role: "admin", active: true, id: { not: id } } });
      if (otherAdmins === 0) {
        return apiError("Cannot delete the last remaining admin account.", 409);
      }
    }

    await db.passwordResetToken.deleteMany({ where: { userId: id } });
    await db.userPayrollFeature.deleteMany({ where: { userId: id } });
    await db.userPayrollEmployeeScope.deleteMany({ where: { userId: id } });
    await db.user.delete({ where: { id } });

    await logAudit({ session, action: "delete", entity: "User", entityId: id, details: { email: existing.email, name: existing.name, role: existing.role } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "delete user");
  }
}
