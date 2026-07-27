import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

const verifySchema = z.object({ verifiedStatus: z.enum(["verified", "rejected"]) });

// PUT /api/documents/[id]/verify — admin/hr only. This is a manual attestation step (HR
// visually reviews the uploaded copy) — there is no real government ID verification API wired
// here, since that requires regulated UIDAI/NSDL API access this deployment doesn't have.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id } = await params;
    const body = await request.json();
    const { verifiedStatus } = verifySchema.parse(body);

    const existing = await db.employeeDocument.findUnique({ where: { id } });
    if (!existing) {
      return apiError("Document not found", 404);
    }

    const doc = await db.employeeDocument.update({
      where: { id },
      data: { verifiedStatus, verifiedBy: session.userId, verifiedAt: new Date() },
    });

    await logAudit({ session, action: "update", entity: "EmployeeDocument", entityId: id, details: { verifiedStatus } });

    return NextResponse.json({ data: doc });
  } catch (error) {
    return handleApiError(error, "verify document");
  }
}
