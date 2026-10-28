import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-utils";
import { computeEntries, reconcile } from "@/lib/workforce/finalize";
import { workforceError } from "@/lib/workforce/route-helpers";

// GET /api/workforce/month/entries?year=&month=&projectId= — admin/hr. Payroll-ready entries (only
// those whose suggestions an admin approved), what is still blocked and why, and — once payroll has
// run — a reconciliation of what was expected against what the existing alternate-pay run recorded.
// The entries match POST /api/payroll/alternate-pay's body, which an admin then submits.
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ["admin", "hr"]);
    const sp = request.nextUrl.searchParams;
    const year = parseInt(sp.get("year") ?? "", 10);
    const month = parseInt(sp.get("month") ?? "", 10);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return apiError("year and month are required.", 400);
    const { entries, blocked } = await computeEntries(year, month, sp.get("projectId") ?? undefined);
    return NextResponse.json({
      data: {
        month, year, entries, blocked, reconciliation: await reconcile(year, month, entries),
        payload: { month, year, entries: entries.map((e) => ({ employeeId: e.employeeId, unitsWorked: e.unitsWorked, rateOverride: e.rateOverride })) },
      },
    });
  } catch (error) {
    return workforceError(error, "compute payroll entries");
  }
}
