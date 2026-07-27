import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAuth, requireRole } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

const createShiftSchema = z.object({
  name: z.string().trim().min(1).max(100),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM 24-hour format"),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM 24-hour format"),
  gracePeriodMinutes: z.coerce.number().int().min(0).max(120).default(15),
});

// GET /api/shifts
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const shifts = await db.shift.findMany({ orderBy: { startTime: "asc" } });
    return NextResponse.json({ data: shifts });
  } catch (error) {
    return handleApiError(error, "fetch shifts");
  }
}

// POST /api/shifts — admin/hr only.
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const body = await request.json();
    const parsed = createShiftSchema.parse(body);

    const shift = await db.shift.create({ data: parsed });
    await logAudit({ session, action: "create", entity: "Shift", entityId: shift.id });

    return NextResponse.json({ data: shift }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "create shift");
  }
}
