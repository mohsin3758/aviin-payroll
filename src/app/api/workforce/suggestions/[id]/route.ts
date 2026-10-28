import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { workforceError } from "@/lib/workforce/route-helpers";

const schema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approve"), reason: z.string().trim().max(500).optional() }),
  z.object({ decision: z.literal("reject"), reason: z.string().trim().min(5, "Say why").max(500) }),
  z.object({
    decision: z.literal("modify"),
    reason: z.string().trim().min(5, "Say why").max(500),
    // deduction: replace the number of unpaid days. prefill: replace units and/or rate directly.
    unpaidDays: z.number().min(0).max(31).optional(),
    unitsWorked: z.number().positive().optional(),
    rateOverride: z.number().positive().optional(),
  }),
]);

// PATCH /api/workforce/suggestions/[id] — admin/hr. The ONLY way a deduction, warning or pay entry
// proposed by the system can take effect: a named person approves, rejects or modifies it, with a
// reason, and that decision is audited. Nothing is ever applied automatically.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id } = await params;
    const s = await db.suggestion.findUnique({ where: { id } });
    if (!s) return apiError("Not found", 404);
    if (s.status !== "pending_admin") return apiError("This suggestion has already been decided.", 409);
    const body = schema.parse(await request.json());

    let detail = JSON.parse(s.detail);
    let status = body.decision === "approve" ? "approved" : body.decision === "reject" ? "rejected" : "modified";

    if (body.decision === "modify") {
      if (s.kind === "deduction") {
        if (body.unpaidDays === undefined) return apiError("Give the corrected number of unpaid days.", 400);
        detail = { ...detail, modifiedUnpaidDays: body.unpaidDays };
      } else if (s.kind === "prefill") {
        if (body.unitsWorked === undefined || body.rateOverride === undefined) return apiError("Give both the units and the rate.", 400);
        detail = { ...detail, override: { unitsWorked: body.unitsWorked, rateOverride: body.rateOverride } };
      } else {
        status = "approved"; // warnings/blockers carry nothing to modify
      }
    }
    const updated = await db.suggestion.update({
      where: { id },
      data: { status, detail: JSON.stringify(detail), decidedBy: session.userId, decidedReason: body.reason ?? null, decidedAt: new Date() },
    });
    await logAudit({ session, action: `suggestion_${body.decision}`, entity: "Suggestion", entityId: id, details: { kind: s.kind, assignmentId: s.assignmentId, ...body } });
    return NextResponse.json({ data: { ...updated, detail } });
  } catch (error) {
    return workforceError(error, "decide suggestion");
  }
}
