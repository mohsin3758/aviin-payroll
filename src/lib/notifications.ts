import { db } from "@/lib/db";

export type NotificationCategory = "leave" | "payroll" | "exit" | "onboarding" | "helpdesk" | "attendance" | "general";

/** Fire-and-forget: a failed notification write must never break the primary request flow. */
export async function notify(params: {
  userId: string;
  title: string;
  message: string;
  category?: NotificationCategory;
  link?: string;
}) {
  try {
    await db.notification.create({
      data: {
        userId: params.userId,
        title: params.title,
        message: params.message,
        category: params.category ?? "general",
        link: params.link ?? null,
      },
    });
  } catch (error) {
    console.error("Failed to create notification:", error);
  }
}

/** Looks up the User row linked to an employeeId (if any) and notifies them. No-op if unlinked. */
export async function notifyEmployee(
  employeeId: string,
  params: { title: string; message: string; category?: NotificationCategory; link?: string }
) {
  const user = await db.user.findUnique({ where: { employeeId } });
  if (!user) return;
  await notify({ userId: user.id, ...params });
}

/** Notifies every active user with one of the given roles (e.g. all HR/admins). */
export async function notifyRoles(
  roles: string[],
  params: { title: string; message: string; category?: NotificationCategory; link?: string }
) {
  const users = await db.user.findMany({ where: { role: { in: roles }, active: true } });
  await Promise.all(users.map((u) => notify({ userId: u.id, ...params })));
}
