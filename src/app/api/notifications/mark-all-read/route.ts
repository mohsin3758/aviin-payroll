import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";

// POST /api/notifications/mark-all-read — marks all of the CURRENT user's notifications read.
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    await db.notification.updateMany({
      where: { userId: session.userId, isRead: false },
      data: { isRead: true },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "mark all notifications read");
  }
}
