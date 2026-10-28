import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { runTick } from "@/lib/workforce/tick";
import { logAudit } from "@/lib/audit";

// POST /api/workforce/tick — admin only. Runs one automation pass immediately (the worker does
// this every minute). Body { now?: ISO } simulates a different clock time, which is only allowed
// outside production unless WORKFORCE_ALLOW_TICK_NOW=1 is set, so a stray request can never make
// a production system act as if it were another time of day.
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin"]);
    const body = await request.json().catch(() => ({}));
    let now = new Date();
    if (body?.now !== undefined) {
      if (process.env.NODE_ENV === "production" && process.env.WORKFORCE_ALLOW_TICK_NOW !== "1") {
        return apiError("Simulating the time is disabled in production.", 403);
      }
      const parsed = new Date(body.now);
      if (isNaN(parsed.getTime())) return apiError("now must be an ISO date-time.", 400);
      now = parsed;
    }
    const result = await runTick(now);
    await logAudit({ session, action: "manual_tick", entity: "Worker", details: { now: now.toISOString(), ...result } });
    return NextResponse.json({ data: result });
  } catch (error) {
    return handleApiError(error, "run workforce tick");
  }
}
