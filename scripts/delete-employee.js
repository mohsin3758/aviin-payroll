/**
 * One-off maintenance script to permanently remove a single employee and every row that
 * references it, in FK-safe order. There is no cascade delete configured on Employee by
 * design (so a real employee's history can never accidentally disappear) — this script exists
 * for genuinely non-real records (e.g. leftover demo/seed data) where a full purge is wanted
 * instead of the app's normal soft-delete (DELETE /api/employees/[id] just sets dateOfExit).
 *
 * Plain CommonJS (no build step, no devDependencies) so it can run inside the production
 * container with a bare `node` — the standalone image doesn't ship tsx/ts-node.
 *
 * Usage: node scripts/delete-employee.js <employeeCode> [--confirm]
 */
const { PrismaClient } = require("@prisma/client");

const db = new PrismaClient();

async function main() {
  const employeeCode = process.argv[2];
  const confirmed = process.argv.includes("--confirm");

  if (!employeeCode) {
    console.error("Usage: node scripts/delete-employee.js <employeeCode> [--confirm]");
    process.exit(1);
  }

  const employee = await db.employee.findUnique({ where: { employeeCode } });
  if (!employee) {
    console.error(`No employee found with code ${employeeCode}`);
    process.exit(1);
  }

  const [loans, tickets, exitRequests, payrollDetails, attendanceCount] = await Promise.all([
    db.employeeLoan.findMany({ where: { employeeId: employee.id } }),
    db.helpDeskTicket.findMany({ where: { employeeId: employee.id } }),
    db.exitRequest.findMany({ where: { employeeId: employee.id } }),
    db.payrollDetail.findMany({ where: { employeeId: employee.id } }),
    db.attendance.count({ where: { employeeId: employee.id } }),
  ]);

  console.log(`Employee: ${employee.firstName} ${employee.lastName ?? ""} (${employee.employeeCode}, id=${employee.id})`);
  console.log(`Related: ${loans.length} loan(s), ${tickets.length} helpdesk ticket(s), ${exitRequests.length} exit request(s), ${payrollDetails.length} payroll detail row(s), ${attendanceCount} attendance row(s)`);

  if (!confirmed) {
    console.log("\nDry run only — re-run with --confirm to actually delete.");
    process.exit(0);
  }

  const loanIds = loans.map((l) => l.id);
  const ticketIds = tickets.map((t) => t.id);
  const exitRequestIds = exitRequests.map((e) => e.id);
  const affectedRunIds = [...new Set(payrollDetails.map((d) => d.payrollRunId))];

  await db.$transaction([
    // Second-level children (FK to a first-level child row, not directly to Employee) first.
    db.loanPayment.deleteMany({ where: { loanId: { in: loanIds } } }),
    db.helpDeskReply.deleteMany({ where: { ticketId: { in: ticketIds } } }),
    db.exitChecklistItem.deleteMany({ where: { exitRequestId: { in: exitRequestIds } } }),
    db.finalSettlement.deleteMany({ where: { employeeId: employee.id } }),
    db.exitRequest.deleteMany({ where: { employeeId: employee.id } }),
    db.employeeLoan.deleteMany({ where: { employeeId: employee.id } }),
    db.helpDeskTicket.deleteMany({ where: { employeeId: employee.id } }),

    // Direct children of Employee.
    db.payrollDetail.deleteMany({ where: { employeeId: employee.id } }),
    db.attendance.deleteMany({ where: { employeeId: employee.id } }),
    db.attendanceRegularizationRequest.deleteMany({ where: { employeeId: employee.id } }),
    db.faceEnrollment.deleteMany({ where: { employeeId: employee.id } }),
    db.leaveBalance.deleteMany({ where: { employeeId: employee.id } }),
    db.leaveApplication.deleteMany({ where: { employeeId: employee.id } }),
    db.investmentDeclaration.deleteMany({ where: { employeeId: employee.id } }),
    db.salaryArrear.deleteMany({ where: { employeeId: employee.id } }),
    db.onboardingInvite.deleteMany({ where: { employeeId: employee.id } }),
    db.employeeFamilyMember.deleteMany({ where: { employeeId: employee.id } }),
    db.employeeEducation.deleteMany({ where: { employeeId: employee.id } }),
    db.employeeExperience.deleteMany({ where: { employeeId: employee.id } }),
    db.employeeDocument.deleteMany({ where: { employeeId: employee.id } }),
    db.employeeAsset.deleteMany({ where: { employeeId: employee.id } }),
    db.onboardingTask.deleteMany({ where: { employeeId: employee.id } }),
    db.salaryRevision.deleteMany({ where: { employeeId: employee.id } }),
    db.expenseClaim.deleteMany({ where: { employeeId: employee.id } }),
    db.employeeShift.deleteMany({ where: { employeeId: employee.id } }),
    db.user.deleteMany({ where: { employeeId: employee.id } }),
    db.salaryStructure.deleteMany({ where: { employeeId: employee.id } }),

    // Finally the employee row itself.
    db.employee.delete({ where: { id: employee.id } }),
  ]);

  // The run(s) this employee's PayrollDetail rows belonged to had aggregate totals computed
  // including this employee — recompute those aggregates from the remaining details so the run
  // stays internally consistent (summary cards, reports) after the row is gone.
  for (const runId of affectedRunIds) {
    const remaining = await db.payrollDetail.findMany({ where: { payrollRunId: runId } });
    const sum = (fn) => remaining.reduce((acc, d) => acc + fn(d), 0);
    await db.payrollRun.update({
      where: { id: runId },
      data: {
        totalEmployees: remaining.length,
        totalGrossSalary: sum((d) => d.grossSalary),
        totalDeductions: sum((d) => d.totalDeductions),
        totalNetSalary: sum((d) => d.netSalary),
        totalEmployerPF: sum((d) => d.employerPF),
        totalEmployerESI: sum((d) => d.employerESI),
        totalEmployeePF: sum((d) => d.employeePF),
        totalEmployeeESI: sum((d) => d.employeeESI),
        totalTDS: sum((d) => d.tds),
        totalPT: sum((d) => d.professionalTax),
        totalLWF: sum((d) => d.lwf),
      },
    });
    console.log(`Recomputed totals for payroll run ${runId} (${remaining.length} employee(s) remaining).`);
  }

  console.log(`\nDeleted employee ${employeeCode} and all related records.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
