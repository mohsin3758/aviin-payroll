import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getMonthName } from "@/lib/payroll/engine";

const VALID_TYPES = ["pf", "esi", "tds", "pt", "lwf", "summary"] as const;
type ReportType = (typeof VALID_TYPES)[number];

// GET /api/reports?month=1&year=2025&type=pf
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const monthParam = searchParams.get("month");
    const yearParam = searchParams.get("year");
    const type = searchParams.get("type") ?? "summary";

    if (!monthParam || !yearParam) {
      return NextResponse.json(
        { error: "month and year are required query parameters" },
        { status: 400 }
      );
    }

    const month = parseInt(monthParam, 10);
    const year = parseInt(yearParam, 10);

    if (isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json(
        { error: "month must be between 1 and 12" },
        { status: 400 }
      );
    }
    if (isNaN(year) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: "year must be a valid year" },
        { status: 400 }
      );
    }
    if (!VALID_TYPES.includes(type as ReportType)) {
      return NextResponse.json(
        { error: `type must be one of: ${VALID_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    // Fetch payroll run and details with employee info
    const payrollRun = await db.payrollRun.findFirst({
      where: { month, year },
      include: {
        details: {
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                employeeCode: true,
                designation: true,
                department: true,
                state: true,
                panNumber: true,
                pfApplicable: true,
                esiApplicable: true,
                taxRegime: true,
              },
            },
          },
        },
        company: {
          select: {
            name: true,
            pan: true,
            tan: true,
            pfNumber: true,
            esiNumber: true,
          },
        },
      },
    });

    if (!payrollRun) {
      return NextResponse.json(
        { error: "No payroll run found for the given month/year" },
        { status: 404 }
      );
    }

    const details = payrollRun.details;

    switch (type as ReportType) {
      case "pf":
        return NextResponse.json({
          data: {
            month,
            year,
            monthName: getMonthName(month),
            company: payrollRun.company,
            totalEmployees: details.length,
            employees: details
              .filter((d) => d.employee.pfApplicable)
              .map((d) => {
                const basicDA = d.basic + d.dearnessAllowance;
                // Compute EPS (capped at 15,000 wages, max 1,250)
                const epsWages = Math.min(basicDA, 15000);
                const employerEPS = Math.min(
                  Math.round(epsWages * 0.0833),
                  1250
                );
                // EDLI: 0.5% on min(basicDA, 15000)
                const employerEDLI = Math.round(
                  Math.min(basicDA, 15000) * 0.005
                );
                return {
                  employeeId: d.employee.id,
                  employeeName: `${d.employee.firstName} ${d.employee.lastName ?? ""}`.trim(),
                  employeeCode: d.employee.employeeCode,
                  designation: d.employee.designation,
                  department: d.employee.department,
                  pfWages: basicDA,
                  employeePF: d.employeePF,
                  employerPF: d.employerPF,
                  employerEPS,
                  employerEDLI,
                  totalPF: d.employeePF + d.employerPF + employerEPS + employerEDLI,
                };
              }),
            totals: {
              totalEmployeePF: details.reduce((s, d) => s + d.employeePF, 0),
              totalEmployerPF: details.reduce((s, d) => s + d.employerPF, 0),
              totalEmployerEPS: details
                .filter((d) => d.employee.pfApplicable)
                .reduce((s, d) => {
                  const basicDA = d.basic + d.dearnessAllowance;
                  return (
                    s + Math.min(Math.round(Math.min(basicDA, 15000) * 0.0833), 1250)
                  );
                }, 0),
              totalEmployerEDLI: details
                .filter((d) => d.employee.pfApplicable)
                .reduce((s, d) => {
                  const basicDA = d.basic + d.dearnessAllowance;
                  return s + Math.round(Math.min(basicDA, 15000) * 0.005);
                }, 0),
            },
          },
        });

      case "esi": {
        const esiEmployees = details.filter(
          (d) => d.employee.esiApplicable
        );
        return NextResponse.json({
          data: {
            month,
            year,
            monthName: getMonthName(month),
            company: payrollRun.company,
            totalApplicableEmployees: esiEmployees.length,
            employees: esiEmployees.map((d) => ({
              employeeId: d.employee.id,
              employeeName: `${d.employee.firstName} ${d.employee.lastName ?? ""}`.trim(),
              employeeCode: d.employee.employeeCode,
              designation: d.employee.designation,
              department: d.employee.department,
              esiWages: d.grossSalary,
              employeeESI: d.employeeESI,
              employerESI: d.employerESI,
              totalESI: d.employeeESI + d.employerESI,
            })),
            totals: {
              totalEmployeeESI: esiEmployees.reduce(
                (s, d) => s + d.employeeESI,
                0
              ),
              totalEmployerESI: esiEmployees.reduce(
                (s, d) => s + d.employerESI,
                0
              ),
            },
          },
        });
      }

      case "tds":
        return NextResponse.json({
          data: {
            month,
            year,
            monthName: getMonthName(month),
            company: payrollRun.company,
            totalEmployees: details.length,
            employees: details.map((d) => ({
              employeeId: d.employee.id,
              employeeName: `${d.employee.firstName} ${d.employee.lastName ?? ""}`.trim(),
              employeeCode: d.employee.employeeCode,
              designation: d.employee.designation,
              department: d.employee.department,
              panNumber: d.employee.panNumber ?? "",
              taxRegime: d.employee.taxRegime,
              grossSalary: d.grossSalary,
              tdsMonthly: d.tds,
              tdsAnnual: Math.round(d.tds * 12),
            })),
            totals: {
              totalTDS: details.reduce((s, d) => s + d.tds, 0),
              totalTDSAnnual: details.reduce(
                (s, d) => s + Math.round(d.tds * 12),
                0
              ),
              newRegimeCount: details.filter(
                (d) => d.employee.taxRegime === "new"
              ).length,
              oldRegimeCount: details.filter(
                (d) => d.employee.taxRegime === "old"
              ).length,
            },
          },
        });

      case "pt": {
        // Group by state
        const byState: Record<
          string,
          {
            employeeId: string;
            employeeName: string;
            employeeCode: string;
            department: string;
            professionalTax: number;
          }[]
        > = {};

        for (const d of details) {
          const state = d.employee.state || "Unknown";
          if (!byState[state]) byState[state] = [];
          byState[state].push({
            employeeId: d.employee.id,
            employeeName: `${d.employee.firstName} ${d.employee.lastName ?? ""}`.trim(),
            employeeCode: d.employee.employeeCode,
            department: d.employee.department,
            professionalTax: d.professionalTax,
          });
        }

        const stateSummary = Object.entries(byState).map(
          ([state, employees]) => ({
            state,
            employeeCount: employees.length,
            totalPT: employees.reduce((s, e) => s + e.professionalTax, 0),
            employees,
          })
        );

        return NextResponse.json({
          data: {
            month,
            year,
            monthName: getMonthName(month),
            company: payrollRun.company,
            totalPT: details.reduce((s, d) => s + d.professionalTax, 0),
            states: stateSummary,
          },
        });
      }

      case "lwf": {
        const byState: Record<
          string,
          {
            employeeId: string;
            employeeName: string;
            employeeCode: string;
            department: string;
            lwf: number;
          }[]
        > = {};

        for (const d of details) {
          if (d.lwf <= 0) continue;
          const state = d.employee.state || "Unknown";
          if (!byState[state]) byState[state] = [];
          byState[state].push({
            employeeId: d.employee.id,
            employeeName: `${d.employee.firstName} ${d.employee.lastName ?? ""}`.trim(),
            employeeCode: d.employee.employeeCode,
            department: d.employee.department,
            lwf: d.lwf,
          });
        }

        const stateSummary = Object.entries(byState).map(
          ([state, employees]) => ({
            state,
            employeeCount: employees.length,
            totalLWF: employees.reduce((s, e) => s + e.lwf, 0),
            employees,
          })
        );

        return NextResponse.json({
          data: {
            month,
            year,
            monthName: getMonthName(month),
            company: payrollRun.company,
            totalLWF: details.reduce((s, d) => s + d.lwf, 0),
            states: stateSummary,
          },
        });
      }

      case "summary":
      default: {
        const totalGross = details.reduce((s, d) => s + d.grossSalary, 0);
        const totalNet = details.reduce((s, d) => s + d.netSalary, 0);
        const totalDeductions = details.reduce(
          (s, d) => s + d.totalDeductions,
          0
        );
        const totalEarnings = details.reduce(
          (s, d) => s + d.totalEarnings,
          0
        );
        const totalCTC = details.reduce((s, d) => s + d.ctc, 0);

        const totalEmployeePF = details.reduce(
          (s, d) => s + d.employeePF,
          0
        );
        const totalEmployerPF = details.reduce(
          (s, d) => s + d.employerPF,
          0
        );
        const totalEmployeeESI = details.reduce(
          (s, d) => s + d.employeeESI,
          0
        );
        const totalEmployerESI = details.reduce(
          (s, d) => s + d.employerESI,
          0
        );
        const totalTDS = details.reduce((s, d) => s + d.tds, 0);
        const totalPT = details.reduce(
          (s, d) => s + d.professionalTax,
          0
        );
        const totalLWF = details.reduce((s, d) => s + d.lwf, 0);

        return NextResponse.json({
          data: {
            month,
            year,
            monthName: getMonthName(month),
            company: payrollRun.company,
            totalEmployees: details.length,
            payrollRunStatus: payrollRun.status,
            earnings: {
              totalEarnings,
              totalGrossSalary: totalGross,
              totalCTC,
            },
            deductions: {
              totalDeductions,
              totalEmployeePF,
              totalTDS,
              totalPT,
              totalLWF,
              totalEmployeeESI,
            },
            employerContributions: {
              totalEmployerPF,
              totalEmployerESI,
            },
            netPay: {
              totalNetSalary: totalNet,
              totalGrossSalary: totalGross,
              totalDeductions,
            },
            statutoryTotals: {
              pf: {
                employeeShare: totalEmployeePF,
                employerShare: totalEmployerPF,
                total: totalEmployeePF + totalEmployerPF,
              },
              esi: {
                employeeShare: totalEmployeeESI,
                employerShare: totalEmployerESI,
                total: totalEmployeeESI + totalEmployerESI,
              },
              tds: totalTDS,
              professionalTax: totalPT,
              lwf: totalLWF,
            },
          },
        });
      }
    }
  } catch (error) {
    console.error("[REPORTS_GET]", error);
    return NextResponse.json(
      { error: "Failed to generate report" },
      { status: 500 }
    );
  }
}
