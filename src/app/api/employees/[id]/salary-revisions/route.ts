import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requirePayrollSelfOrFeature } from "@/lib/payroll-access";
import { handleApiError } from "@/lib/api-utils";

// GET /api/employees/[id]/salary-revisions — the append-only salary change history. Treated
// like salary-slip/form16: self or admin/hr only, not manager (raw before/after comp figures).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requirePayrollSelfOrFeature(request, id, ["admin", "hr"], "view_payroll");
    const revisions = await db.salaryRevision.findMany({
      where: { employeeId: id },
      orderBy: { effectiveDate: "desc" },
    });
    return NextResponse.json({ data: revisions });
  } catch (error) {
    return handleApiError(error, "fetch salary revisions");
  }
}
