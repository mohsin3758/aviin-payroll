import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resetPasswordSchema } from "@/lib/validations/user";
import { apiError, handleApiError } from "@/lib/api-utils";
import { requireRole, hashPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// POST /api/users/[id]/reset-password — admin only, sets a new password for ANY user
// (including their own) without needing the old one. Never logs the password itself.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin"]);
    const { id } = await params;
    const body = await request.json();
    const { newPassword } = resetPasswordSchema.parse(body);

    const existing = await db.user.findUnique({ where: { id } });
    if (!existing) {
      return apiError("User not found", 404);
    }

    const passwordHash = await hashPassword(newPassword);
    await db.user.update({ where: { id }, data: { passwordHash } });

    await logAudit({ session, action: "reset-password", entity: "User", entityId: id });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "reset user password");
  }
}
