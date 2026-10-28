import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { workforceError } from "@/lib/workforce/route-helpers";

// GET /api/workforce/suggestions?year=&month=&status= — admin/hr only (these carry pay figures).
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ["admin", "hr"]);
    const sp = request.nextUrl.searchParams;
    const where: Record<string, unknown> = {};
    if (sp.get("year")) where.year = parseInt(sp.get("year")!, 10);
    if (sp.get("month")) where.month = parseInt(sp.get("month")!, 10);
    if (sp.get("status")) where.status = sp.get("status");
    const rows = await db.suggestion.findMany({ where, orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "asc" }], take: 500 });
    const employees = await db.employee.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.employeeId))] } }, select: { id: true, employeeCode: true, firstName: true, lastName: true } });
    const byId = new Map(employees.map((e) => [e.id, e]));
    return NextResponse.json({
      data: rows.map((r) => ({
        ...r, detail: JSON.parse(r.detail),
        contractor: byId.get(r.employeeId) ? `${byId.get(r.employeeId)!.firstName} ${byId.get(r.employeeId)!.lastName ?? ""}`.trim() : r.employeeId,
        employeeCode: byId.get(r.employeeId)?.employeeCode ?? null,
      })),
    });
  } catch (error) {
    return workforceError(error, "fetch suggestions");
  }
}
