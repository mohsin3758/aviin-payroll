import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";

// GET /api/notifications — the current user's own notifications, newest first.
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(request);
    const { searchParams } = request.nextUrl;
    const unreadOnly = searchParams.get("unreadOnly") === "true";

    const [notifications, unreadCount] = await Promise.all([
      db.notification.findMany({
        where: { userId: session.userId, ...(unreadOnly ? { isRead: false } : {}) },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      db.notification.count({ where: { userId: session.userId, isRead: false } }),
    ]);

    return NextResponse.json({ data: notifications, unreadCount });
  } catch (error) {
    return handleApiError(error, "fetch notifications");
  }
}
