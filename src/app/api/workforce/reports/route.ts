import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { apiError } from "@/lib/api-utils";
import { visibleAssignments } from "@/lib/workforce/scope-server";
import { buildReport, reportToCsv, type GroupBy } from "@/lib/workforce/reports";
import { parseDay, workforceError } from "@/lib/workforce/route-helpers";

const GROUPS: GroupBy[] = ["project", "client", "contractor", "coordinator"];

// GET /api/workforce/reports?from=YYYY-MM-DD&to=YYYY-MM-DD&groupBy=project|client|contractor|coordinator&format=json|csv
// Scoped like everything else: admin/hr see all, a coordinator only the assignments they coordinate.
// The contractor score is shown with its components and reasons, never as a bare number.
export async function GET(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin", "hr", "manager"]);
    const sp = request.nextUrl.searchParams;
    const from = parseDay(sp.get("from"));
    const to = parseDay(sp.get("to"));
    const groupBy = (sp.get("groupBy") ?? "project") as GroupBy;
    if (!from || !to || to < from) return apiError("from and to (YYYY-MM-DD, to on or after from) are required.", 400);
    if ((to.getTime() - from.getTime()) / 86_400_000 > 400) return apiError("Choose a range of 400 days or less.", 400);
    if (!GROUPS.includes(groupBy)) return apiError(`groupBy must be one of ${GROUPS.join(", ")}.`, 400);

    const assignments = await visibleAssignments(session);
    const rows = await buildReport({ assignmentIds: assignments.map((a) => a.id), from, to, groupBy });
    if (sp.get("format") === "csv") {
      return new NextResponse(reportToCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="workforce-${groupBy}-${sp.get("from")}-${sp.get("to")}.csv"` } });
    }
    return NextResponse.json({ data: rows });
  } catch (error) {
    return workforceError(error, "build workforce report");
  }
}
