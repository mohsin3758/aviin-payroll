import { db } from "@/lib/db";
import { calculateGratuity } from "@/lib/payroll/gratuity";

export class FinalSettlementError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/**
 * Computes a full-and-final settlement for an exiting employee:
 *  + full remaining leave balance encashed (not just the excess-over-carry-forward-cap used by
 *    the mid-service /api/leaves/encashment route — a departing employee has nothing left to
 *    carry forward, so the whole remaining balance is paid out)
 *  + any pending (unpaid) salary arrears
 *  + gratuity per the Payment of Gratuity Act (5-year vesting, statutory cap)
 *  - full outstanding balance on all active loans (not just one EMI — the rest is recovered now)
 *  - a notice-period shortfall deduction, if actualLastWorkingDate is earlier than the
 *    already-computed lastWorkingDate on the ExitRequest
 */
export async function computeFinalSettlement(exitRequestId: string, actualLastWorkingDate?: Date) {
  const exitRequest = await db.exitRequest.findUnique({ where: { id: exitRequestId } });
  if (!exitRequest) {
    throw new FinalSettlementError("Exit request not found", 404);
  }

  const employee = await db.employee.findUnique({
    where: { id: exitRequest.employeeId },
    include: { salaryStructure: true },
  });
  if (!employee || !employee.salaryStructure) {
    throw new FinalSettlementError("Employee salary structure not configured", 400);
  }

  const lastWorkingDate = actualLastWorkingDate ?? exitRequest.lastWorkingDate;
  const basicDA = employee.salaryStructure.basic + employee.salaryStructure.dearnessAllowance;
  const perDayRate = basicDA / 30;

  // Leave encashment: full remaining balance across every paid leave type for the exit year.
  const year = lastWorkingDate.getFullYear();
  const balances = await db.leaveBalance.findMany({
    where: { employeeId: employee.id, year },
    include: { leaveType: true },
  });
  const encashableDays = balances
    .filter((b) => b.leaveType.isPaid)
    .reduce((sum, b) => sum + Math.max(0, b.totalAllocated + b.carryForwarded - b.used), 0);
  const leaveEncashmentAmount = Math.round(perDayRate * encashableDays);

  // Pending arrears never paid out.
  const pendingArrears = await db.salaryArrear.findMany({
    where: { employeeId: employee.id, status: "pending" },
  });
  const pendingArrearsAmount = pendingArrears.reduce((sum, a) => sum + a.amount, 0);

  // Gratuity.
  const gratuityResult = calculateGratuity(basicDA, employee.dateOfJoining, lastWorkingDate);
  const gratuityAmount = gratuityResult.cappedAmount;

  // Full outstanding loan balance recovered now (not just one EMI).
  const activeLoans = await db.employeeLoan.findMany({
    where: { employeeId: employee.id, status: "active" },
    include: { payments: true },
  });
  const loanRecoveryAmount = activeLoans.reduce((sum, loan) => {
    const paid = loan.payments.reduce((s, p) => s + p.amount, 0);
    return sum + Math.max(0, loan.principal - paid);
  }, 0);

  // Notice-period shortfall: deduct pay for days short of the required notice, if leaving early.
  const shortfallDays = Math.max(0, Math.ceil((exitRequest.lastWorkingDate.getTime() - lastWorkingDate.getTime()) / (1000 * 60 * 60 * 24)));
  const noticeShortfallAmount = Math.round(perDayRate * shortfallDays);

  const netSettlementAmount =
    leaveEncashmentAmount + pendingArrearsAmount + gratuityAmount - loanRecoveryAmount - noticeShortfallAmount;

  return {
    leaveEncashmentAmount,
    pendingArrearsAmount,
    gratuityAmount,
    gratuityEligible: gratuityResult.eligibleForGratuity,
    gratuityCompletedYears: gratuityResult.completedYears,
    loanRecoveryAmount,
    noticeShortfallAmount,
    netSettlementAmount,
  };
}
