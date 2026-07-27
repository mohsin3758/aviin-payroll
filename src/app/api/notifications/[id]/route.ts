import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";

// PUT /api/notifications/[id] — mark one of the CURRENT user's own notifications as read.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(request);
    const { id } = await params;

    const existing = await db.notification.findUnique({ where: { id } });
    if (!existing || existing.userId !== session.userId) {
      return apiError("Notification not found", 404);
    }

    const notification = await db.notification.update({ where: { id }, data: { isRead: true } });
    return NextResponse.json({ data: notification });
  } catch (error) {
    return handleApiError(error, "update notification");
  }
}
