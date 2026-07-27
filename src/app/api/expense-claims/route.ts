import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { handleApiError } from "@/lib/api-utils";

// GET /api/expense-claims?status= — admin/hr only, all employees' claims.
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ["admin", "hr"]);
    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status");

    const claims = await db.expenseClaim.findMany({
      where: status ? { status } : {},
      include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: claims });
  } catch (error) {
    return handleApiError(error, "fetch expense claims");
  }
}
