import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createActionToken } from "@/lib/workforce/tokens";
import { assertAssignmentAccess, workforceError } from "@/lib/workforce/route-helpers";
import { loadContext } from "@/lib/workforce/daily";
import { localDay } from "@/lib/workforce/time";
import { publicBaseUrl } from "@/lib/workforce/templates";
import { logAudit } from "@/lib/audit";

// POST /api/workforce/assignments/[id]/link — admin/hr or the assignment's coordinator. Creates a
// 36-hour check-in/update link for the contractor, to share by hand (e.g. first day, or when
// WhatsApp is down). Whoever holds the link can act for that contractor today, so treat it like a
// password: the response shows it once and only its hash is stored.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr", "manager"]);
    const { id } = await params;
    await assertAssignmentAccess(session, id);
    const ctx = await loadContext(id);
    if (!ctx) return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    const token = await createActionToken({ purpose: "contractor", assignmentId: id, date: localDay(new Date(), ctx.tzOffsetMinutes), ttlHours: 36 });
    await logAudit({ session, action: "create_link", entity: "Assignment", entityId: id, details: { purpose: "contractor" } });
    return NextResponse.json({ data: { url: `${publicBaseUrl()}/u/${token}`, expiresInHours: 36 } }, { status: 201 });
  } catch (error) {
    return workforceError(error, "create contractor link");
  }
}
