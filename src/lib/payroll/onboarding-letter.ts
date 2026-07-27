import { db } from "@/lib/db";

export class OnboardingLetterError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export type LetterType = "offer" | "appointment" | "experience" | "relieving";

export async function getOnboardingLetterData(employeeId: string) {
  const employee = await db.employee.findUnique({
    where: { id: employeeId },
    include: { company: true, salaryStructure: true },
  });
  if (!employee) {
    throw new OnboardingLetterError("Employee not found", 404);
  }
  if (!employee.salaryStructure) {
    throw new OnboardingLetterError("Salary structure not configured for this employee", 400);
  }

  const ss = employee.salaryStructure;
  const monthlyCtc =
    ss.basic + ss.dearnessAllowance + ss.houseRentAllowance + ss.conveyanceAllowance +
    ss.medicalAllowance + ss.specialAllowance + ss.overtimeAllowance + ss.bonus +
    ss.otherEarnings + ss.employerPF + ss.employerESI + ss.gratuity;

  return {
    employee: {
      name: `${employee.firstName} ${employee.lastName ?? ""}`.trim(),
      code: employee.employeeCode,
      designation: employee.designation,
      department: employee.department,
      dateOfJoining: employee.dateOfJoining.toISOString(),
      dateOfExit: employee.dateOfExit ? employee.dateOfExit.toISOString() : null,
      email: employee.email,
    },
    company: {
      name: employee.company.name,
      address: employee.company.address ?? "",
    },
    annualCTC: Math.round(monthlyCtc * 12),
  };
}

export type OnboardingLetterData = Awaited<ReturnType<typeof getOnboardingLetterData>>;
