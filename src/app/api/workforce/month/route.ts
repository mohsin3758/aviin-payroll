import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-utils";
import { visibleClientAndProjectIds } from "@/lib/workforce/scope-server";
import { isFullAccess } from "@/lib/workforce/access";
import { buildProjectMonth } from "@/lib/workforce/month";
import { workforceError } from "@/lib/workforce/route-helpers";

// GET /api/workforce/month?projectId=&year=&month= — the month-end roll-up and what blocks locking it.
// Pay figures are shown only to admin/hr (the same policy as every other compensation number).
export async function GET(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin", "hr", "manager"]);
    const sp = request.nextUrl.searchParams;
    const projectId = sp.get("projectId") ?? "";
    const year = parseInt(sp.get("year") ?? "", 10);
    const month = parseInt(sp.get("month") ?? "", 10);
    if (!projectId || !Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return apiError("projectId, year and month are required.", 400);
    }
    if (!isFullAccess(session.role) && !(await visibleClientAndProjectIds(session)).projectIds.has(projectId)) return apiError("Not found", 404);

    const data = await buildProjectMonth(projectId, year, month);
    if (!isFullAccess(session.role)) {
      data.assignments = data.assignments.map((a) => ({ ...a, payRate: null, prefill: { ok: false, reason: "Hidden" }, prefillWithoutDeduction: null })) as never;
    }
    return NextResponse.json({ data });
  } catch (error) {
    return workforceError(error, "fetch month roll-up");
  }
}
