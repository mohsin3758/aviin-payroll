import { db } from "@/lib/db";
import type { SessionPayload } from "@/lib/auth";

export async function logAudit(params: {
  session: SessionPayload | null;
  action: string;
  entity: string;
  entityId?: string | null;
  details?: unknown;
  ipAddress?: string | null;
}) {
  try {
    await db.auditLog.create({
      data: {
        userId: params.session?.userId ?? null,
        userEmail: params.session?.email ?? null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId ?? null,
        details: params.details ? JSON.stringify(params.details) : null,
        ipAddress: params.ipAddress ?? null,
      },
    });
  } catch (error) {
    // Audit logging must never break the primary request flow.
    console.error("Failed to write audit log:", error);
  }
}
