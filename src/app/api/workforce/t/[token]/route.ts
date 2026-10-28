import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveActionToken } from "@/lib/workforce/tokens";
import { loadContext } from "@/lib/workforce/daily";
import { localDay } from "@/lib/workforce/time";
import { contractorActionSchema, performContractorAction } from "@/lib/workforce/actions";
import { workforceError } from "@/lib/workforce/route-helpers";
import { checkRateLimit } from "@/lib/rate-limit";
import { apiError } from "@/lib/api-utils";

// Public (no session): the signed link in a contractor's WhatsApp message. The token ties the
// request to ONE assignment, so it can only ever act for that contractor, and expires.

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const row = await resolveActionToken(token, "contractor");
    if (!row.assignmentId) return apiError("This link is invalid or has expired.", 404);
    const ctx = await loadContext(row.assignmentId);
    if (!ctx) return apiError("This link is invalid or has expired.", 404);
    const day = localDay(new Date(), ctx.tzOffsetMinutes);
    const daily = await db.dailyStatus.findUnique({ where: { assignmentId_date: { assignmentId: row.assignmentId, date: day } } });
    return NextResponse.json({
      data: {
        name: ctx.assignment.employee.firstName,
        project: ctx.assignment.project.name,
        date: day.toISOString().slice(0, 10),
        shiftStart: ctx.resolved.settings.shiftStart,
        shiftEnd: ctx.resolved.settings.shiftEnd,
        status: daily
          ? { state: daily.state, checkInAt: daily.checkInAt, checkOutAt: daily.checkOutAt, hoursWorked: daily.hoursWorked, eodDone: !!daily.eodAt, closed: daily.closed }
          : null,
      },
    });
  } catch (error) {
    return workforceError(error, "open contractor link");
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? "unknown";
    if (!checkRateLimit(`wf-token:${ip}`, 60, 60_000).allowed) return apiError("Too many requests. Slow down.", 429);
    const { token } = await params;
    const row = await resolveActionToken(token, "contractor");
    if (!row.assignmentId) return apiError("This link is invalid or has expired.", 404);
    const parsed = contractorActionSchema.parse(await request.json());
    const result = await performContractorAction(row.assignmentId, parsed, "web", { session: null, label: "contractor:link" });
    return NextResponse.json({ data: { state: result.daily.state, reasons: result.result?.reasons ?? [] } });
  } catch (error) {
    return workforceError(error, "contractor link action");
  }
}
