import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { changePasswordSchema } from "@/lib/validations/user";
import { apiError, handleApiError } from "@/lib/api-utils";
import { requireAuth, hashPassword, verifyPassword } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// POST /api/auth/change-password — any authenticated user changes their own password.
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const body = await request.json();
    const { currentPassword, newPassword } = changePasswordSchema.parse(body);

    const user = await db.user.findUnique({ where: { id: session.userId } });
    if (!user) {
      return apiError("User not found", 404);
    }

    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) {
      return apiError("Current password is incorrect.", 400);
    }

    const passwordHash = await hashPassword(newPassword);
    await db.user.update({ where: { id: user.id }, data: { passwordHash } });

    await logAudit({ session, action: "change-password", entity: "User", entityId: user.id });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "change password");
  }
}
