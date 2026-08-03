import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";

// GET /api/onboarding-invites/[id] — admin/hr only. Full detail for the review dialog: the
// employee snapshot as submitted, plus every uploaded document.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(request, ["admin", "hr"]);
    const { id } = await params;

    const invite = await db.onboardingInvite.findUnique({
      where: { id },
      include: {
        employee: true,
        candidate: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!invite) return apiError("Onboarding invite not found", 404);

    const documents = await db.employeeDocument.findMany({
      where: { employeeId: invite.employeeId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: { ...invite, documents } });
  } catch (error) {
    return handleApiError(error, "fetch onboarding invite");
  }
}
