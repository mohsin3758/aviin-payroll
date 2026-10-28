import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { workforceError } from "@/lib/workforce/route-helpers";

// GET /api/workforce/staff — admin/hr. Active staff logins (not contractors) who can be named as a
// resource coordinator, client coordinator or KAM, or be assigned an exception. Names and roles only.
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ["admin", "hr"]);
    const users = await db.user.findMany({
      where: { active: true, role: { in: ["admin", "hr", "manager"] } },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ data: users });
  } catch (error) {
    return workforceError(error, "list staff");
  }
}
