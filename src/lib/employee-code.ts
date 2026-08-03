import { db } from "@/lib/db";

/** Generates the next sequential "EMP0001"-style code. Extracted so both the regular
 * employee-creation route and the onboarding-invite creation route stay in sync — duplicating
 * this logic risks the two paths drifting and issuing colliding codes. */
export async function generateNextEmployeeCode(): Promise<string> {
  const lastEmployee = await db.employee.findFirst({
    orderBy: { createdAt: "desc" },
    select: { employeeCode: true },
  });
  const lastNumber = lastEmployee
    ? parseInt(lastEmployee.employeeCode.replace("EMP", ""), 10) || 0
    : 0;
  return `EMP${String(lastNumber + 1).padStart(4, "0")}`;
}
