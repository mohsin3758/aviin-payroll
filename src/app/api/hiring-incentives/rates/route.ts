import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateHiringIncentiveRatesSchema } from "@/lib/validations/hiring-incentive";
import { getDefaultCompanyId, handleApiError } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// GET /api/hiring-incentives/rates — admin/hr can read the two configured payout rates.
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ["admin", "hr"]);
    const companyId = await getDefaultCompanyId();
    const company = await db.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { hiringIncentiveFteRate: true, hiringIncentiveContractRate: true },
    });
    return NextResponse.json({ data: company });
  } catch (error) {
    return handleApiError(error, "fetch hiring incentive rates");
  }
}

// PUT /api/hiring-incentives/rates — admin only (matches PUT /api/settings's role gate).
// Kept as its own small route rather than folded into /api/settings, so both rate fields live
// entirely on the dedicated Hiring Incentives screen.
export async function PUT(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin"]);
    const body = await request.json();
    const parsed = updateHiringIncentiveRatesSchema.parse(body);

    const companyId = await getDefaultCompanyId();
    const company = await db.company.update({
      where: { id: companyId },
      data: parsed,
      select: { hiringIncentiveFteRate: true, hiringIncentiveContractRate: true },
    });

    await logAudit({ session, action: "update", entity: "Company", entityId: companyId, details: { hiringIncentiveRatesChanged: true } });

    return NextResponse.json({ data: company });
  } catch (error) {
    return handleApiError(error, "update hiring incentive rates");
  }
}
