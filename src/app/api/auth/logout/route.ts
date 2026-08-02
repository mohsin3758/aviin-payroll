import { NextRequest, NextResponse } from "next/server";
import { getSession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordPunch } from "@/lib/attendance-punch";

export async function POST(request: NextRequest) {
  // Logout-based attendance mirrors the login hook: opt-in (Company.enableLogoutAttendance,
  // default false), only applies to sessions linked to an employee record, and never lets a
  // failure here (no punch-in today, already punched out, etc.) affect the logout itself.
  try {
    const session = await getSession(request);
    if (session?.employeeId) {
      const company = await db.company.findFirst();
      if (company?.enableLogoutAttendance) {
        await recordPunch({ employeeId: session.employeeId, action: "out", method: "login" });
      }
    }
  } catch (err) {
    console.error("[LOGOUT_ATTENDANCE] Failed to auto-mark attendance on logout:", err);
  }

  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE_NAME, "", { maxAge: 0, path: "/" });
  return res;
}
