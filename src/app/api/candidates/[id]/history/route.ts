import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handleApiError } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth";

const BILLING_KEYS = ["billingType", "billingValue", "paymentReceived"];

// GET /api/candidates/[id]/history — admin/hr only. The audit trail for a single candidate
// (who changed what, and when). hr gets the same history as admin, but with billing/payment
// field changes redacted from each entry's details — consistent with billing being admin-only
// everywhere else on this candidate.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const isAdmin = session.role === "admin";
    const { id } = await params;

    const logs = await db.auditLog.findMany({
      where: { entity: "Candidate", entityId: id },
      orderBy: { createdAt: "desc" },
    });

    const data = logs.map((log) => {
      let details: Record<string, unknown> | null = null;
      if (log.details) {
        try {
          details = JSON.parse(log.details);
        } catch {
          details = null;
        }
      }
      if (details && !isAdmin) {
        details = Object.fromEntries(Object.entries(details).filter(([key]) => !BILLING_KEYS.includes(key)));
        if (Object.keys(details).length === 0) details = null;
      }
      return {
        id: log.id,
        action: log.action,
        userEmail: log.userEmail,
        details,
        createdAt: log.createdAt,
      };
    });

    return NextResponse.json({ data });
  } catch (error) {
    return handleApiError(error, "fetch candidate history");
  }
}
