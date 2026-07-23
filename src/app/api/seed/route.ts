import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { getSession, hashPassword, AuthError } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";

const DEFAULT_USERS = [
  { email: "admin@payrollpro.local", password: "Admin@12345", name: "System Admin", role: "admin" as const },
  { email: "hr@payrollpro.local", password: "HrManager@12345", name: "HR Manager", role: "hr" as const },
  { email: "manager@payrollpro.local", password: "Manager@12345", name: "Dept Manager", role: "manager" as const },
];

// ---------- helper: build SalaryStructure from gross ----------
function buildSalary(gross: number, pfApplicable: boolean, esiApplicable: boolean) {
  const basicRatio = 0.5;
  const basic = Math.round(gross * basicRatio);
  const hra = Math.round(basic * 0.4);
  const da = Math.round(basic * 0.1);
  const conveyance = 1600;
  const medical = 1250;
  const specialAllowance =
    gross - basic - hra - da - conveyance - medical;

  // Employer PF: 12% of Basic, capped at ₹15,000 wage base
  const employerPF = pfApplicable
    ? Math.round((Math.min(basic, 15000) * 0.12) * 100) / 100
    : 0;

  // Employer ESI: 3.25% of gross (only if gross ≤ 21,000)
  const employerESI =
    esiApplicable && gross <= 21000
      ? Math.round(gross * 0.0325 * 100) / 100
      : 0;

  // Gratuity: Basic * 4.81% / 12 (approximate monthly)
  const gratuity = Math.round((basic * 0.0481) / 12 * 100) / 100;

  return {
    basic,
    dearnessAllowance: da,
    houseRentAllowance: hra,
    conveyanceAllowance: conveyance,
    medicalAllowance: medical,
    specialAllowance,
    employerPF,
    employerESI,
    gratuity,
  };
}

// ---------- employee data ----------
interface EmployeeSeed {
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfJoining: string;
  designation: string;
  department: string;
  state: string;
  panNumber: string;
  aadhaarNumber: string;
  bankName: string;
  bankAccountNumber: string;
  bankIfsc: string;
  uanNumber: string;
  esiNumber: string | null;
  pfApplicable: boolean;
  esiApplicable: boolean;
  ptApplicable: boolean;
  lwfApplicable: boolean;
  taxRegime: "new" | "old";
  gender: "male" | "female";
  dateOfBirth: string;
  grossSalary: number;
}

const employees: EmployeeSeed[] = [
  {
    employeeCode: "EMP001",
    firstName: "Arjun",
    lastName: "Sharma",
    email: "arjun.sharma@acmecorp.in",
    phone: "+91 98765 43210",
    dateOfJoining: "2022-03-15",
    designation: "Senior Software Engineer",
    department: "Engineering",
    state: "Maharashtra",
    panNumber: "ABCPS1234K",
    aadhaarNumber: "1234 5678 9012",
    bankName: "HDFC Bank",
    bankAccountNumber: "12345678901234",
    bankIfsc: "HDFC0001234",
    uanNumber: "101234567890",
    esiNumber: null,
    pfApplicable: true,
    esiApplicable: false,
    ptApplicable: true,
    lwfApplicable: true,
    taxRegime: "new",
    gender: "male",
    dateOfBirth: "1994-07-12",
    grossSalary: 150000,
  },
  {
    employeeCode: "EMP002",
    firstName: "Priya",
    lastName: "Nair",
    email: "priya.nair@acmecorp.in",
    phone: "+91 98765 43211",
    dateOfJoining: "2021-06-01",
    designation: "HR Manager",
    department: "HR",
    state: "Karnataka",
    panNumber: "DEFPN5678L",
    aadhaarNumber: "2345 6789 0123",
    bankName: "ICICI Bank",
    bankAccountNumber: "23456789012345",
    bankIfsc: "ICIC0002345",
    uanNumber: "101234567891",
    esiNumber: null,
    pfApplicable: true,
    esiApplicable: false,
    ptApplicable: true,
    lwfApplicable: false,
    taxRegime: "old",
    gender: "female",
    dateOfBirth: "1990-11-25",
    grossSalary: 65000,
  },
  {
    employeeCode: "EMP003",
    firstName: "Vikram",
    lastName: "Patel",
    email: "vikram.patel@acmecorp.in",
    phone: "+91 98765 43212",
    dateOfJoining: "2023-01-10",
    designation: "Finance Analyst",
    department: "Finance",
    state: "Maharashtra",
    panNumber: "GHIVP9012M",
    aadhaarNumber: "3456 7890 1234",
    bankName: "State Bank of India",
    bankAccountNumber: "34567890123456",
    bankIfsc: "SBIN0003456",
    uanNumber: "101234567892",
    esiNumber: null,
    pfApplicable: true,
    esiApplicable: false,
    ptApplicable: true,
    lwfApplicable: true,
    taxRegime: "new",
    gender: "male",
    dateOfBirth: "1996-03-08",
    grossSalary: 85000,
  },
  {
    employeeCode: "EMP004",
    firstName: "Meena",
    lastName: "Krishnan",
    email: "meena.krishnan@acmecorp.in",
    phone: "+91 98765 43213",
    dateOfJoining: "2024-02-20",
    designation: "Marketing Executive",
    department: "Marketing",
    state: "Tamil Nadu",
    panNumber: "JKLMK3456N",
    aadhaarNumber: "4567 8901 2345",
    bankName: "Axis Bank",
    bankAccountNumber: "45678901234567",
    bankIfsc: "UTIB0004567",
    uanNumber: "101234567893",
    esiNumber: "ESI-3200123456",
    pfApplicable: true,
    esiApplicable: true,
    ptApplicable: true,
    lwfApplicable: false,
    taxRegime: "new",
    gender: "female",
    dateOfBirth: "1998-09-14",
    grossSalary: 18000,
  },
  {
    employeeCode: "EMP005",
    firstName: "Suresh",
    lastName: "Reddy",
    email: "suresh.reddy@acmecorp.in",
    phone: "+91 98765 43214",
    dateOfJoining: "2023-08-05",
    designation: "Operations Coordinator",
    department: "Operations",
    state: "Karnataka",
    panNumber: "NOPSR7890P",
    aadhaarNumber: "5678 9012 3456",
    bankName: "Canara Bank",
    bankAccountNumber: "56789012345678",
    bankIfsc: "CNRB0005678",
    uanNumber: "101234567894",
    esiNumber: "ESI-3200123457",
    pfApplicable: true,
    esiApplicable: true,
    ptApplicable: true,
    lwfApplicable: false,
    taxRegime: "old",
    gender: "male",
    dateOfBirth: "1992-01-30",
    grossSalary: 20000,
  },
  {
    employeeCode: "EMP006",
    firstName: "Anjali",
    lastName: "Deshmukh",
    email: "anjali.deshmukh@acmecorp.in",
    phone: "+91 98765 43215",
    dateOfJoining: "2022-11-15",
    designation: "Software Engineer",
    department: "Engineering",
    state: "Maharashtra",
    panNumber: "QRSTA1234Q",
    aadhaarNumber: "6789 0123 4567",
    bankName: "Bank of Baroda",
    bankAccountNumber: "67890123456789",
    bankIfsc: "BARB0678901",
    uanNumber: "101234567895",
    esiNumber: null,
    pfApplicable: true,
    esiApplicable: false,
    ptApplicable: true,
    lwfApplicable: true,
    taxRegime: "new",
    gender: "female",
    dateOfBirth: "1995-05-22",
    grossSalary: 45000,
  },
];

// ---------- leave types ----------
const leaveTypes: Prisma.LeaveTypeCreateManyInput[] = [
  {
    name: "Casual Leave",
    shortCode: "CL",
    totalDays: 12,
    isCarryForward: true,
    maxCarryForward: 4,
    isPaid: true,
  },
  {
    name: "Sick Leave",
    shortCode: "SL",
    totalDays: 10,
    isCarryForward: true,
    maxCarryForward: 5,
    isPaid: true,
  },
  {
    name: "Earned Leave",
    shortCode: "EL",
    totalDays: 15,
    isCarryForward: true,
    maxCarryForward: 7,
    isPaid: true,
  },
  {
    name: "Compensatory Off",
    shortCode: "CO",
    totalDays: 5,
    isCarryForward: false,
    maxCarryForward: 0,
    isPaid: true,
  },
];

// ---------- current financial year ----------
const FINANCIAL_YEAR = new Date().getFullYear();

// ---------- POST handler ----------
export async function POST(request: NextRequest) {
  try {
    // Destructive endpoint: requires an explicit confirmation token, and either
    // an admin session, or (first-run bootstrap only) no users existing yet.
    const body = await request.json().catch(() => ({}));
    if (body?.confirm !== "RESET_DEMO_DATA") {
      return apiError(
        'Confirmation required: send { "confirm": "RESET_DEMO_DATA" } in the request body.',
        400
      );
    }

    const session = await getSession(request);
    const userCount = await db.user.count();
    if (userCount > 0) {
      if (!session || session.role !== "admin") {
        throw new AuthError("Forbidden — only an admin may reset demo data once users exist.", 403);
      }
    }

    // --- Idempotent: wipe existing data in correct FK order ---
    await db.$transaction([
      db.loanPayment.deleteMany(),
      db.employeeLoan.deleteMany(),
      db.salaryArrear.deleteMany(),
      db.investmentDeclaration.deleteMany(),
      db.payrollDetail.deleteMany(),
      db.payrollRun.deleteMany(),
      db.leaveApplication.deleteMany(),
      db.leaveBalance.deleteMany(),
      db.attendance.deleteMany(),
      db.salaryStructure.deleteMany(),
      db.employee.deleteMany(),
      db.leaveType.deleteMany(),
      db.holiday.deleteMany(),
      db.company.deleteMany(),
    ]);

    // --- 1. Create Company ---
    const company = await db.company.create({
      data: {
        name: "Acme Corp Pvt. Ltd.",
        address:
          "301, Trade Tower, Bandra Kurla Complex, Bandra East, Mumbai – 400051",
        pan: "AABCA1234B",
        tan: "MUMA12345A",
        gstin: "27AABCA1234B1Z5",
        pfNumber: "MHBAN0012345000",
        esiNumber: "31-00-123456-000-0001",
        state: "Maharashtra",
        financialYearStart: "2025-04-01",
        payrollMonth: 4,
        payrollYear: 2025,
      },
    });

    // --- 2. Create Leave Types ---
    const createdLeaveTypes = await Promise.all(
      leaveTypes.map((lt) => db.leaveType.create({ data: lt }))
    );

    // --- 3. Create Employees + SalaryStructures + LeaveBalances ---
    const createdEmployees: { id: string; employeeCode: string }[] = [];

    for (const emp of employees) {
      const salary = buildSalary(
        emp.grossSalary,
        emp.pfApplicable,
        emp.esiApplicable
      );

      const employee = await db.employee.create({
        data: {
          companyId: company.id,
          employeeCode: emp.employeeCode,
          firstName: emp.firstName,
          lastName: emp.lastName,
          email: emp.email,
          phone: emp.phone,
          dateOfJoining: new Date(emp.dateOfJoining),
          designation: emp.designation,
          department: emp.department,
          state: emp.state,
          panNumber: emp.panNumber,
          aadhaarNumber: emp.aadhaarNumber,
          bankName: emp.bankName,
          bankAccountNumber: emp.bankAccountNumber,
          bankIfsc: emp.bankIfsc,
          uanNumber: emp.uanNumber,
          esiNumber: emp.esiNumber,
          pfApplicable: emp.pfApplicable,
          esiApplicable: emp.esiApplicable,
          ptApplicable: emp.ptApplicable,
          lwfApplicable: emp.lwfApplicable,
          taxRegime: emp.taxRegime,
          gender: emp.gender,
          dateOfBirth: new Date(emp.dateOfBirth),
          currentAddress: null,
          salaryStructure: {
            create: {
              effectiveDate: new Date(emp.dateOfJoining),
              basic: salary.basic,
              dearnessAllowance: salary.dearnessAllowance,
              houseRentAllowance: salary.houseRentAllowance,
              conveyanceAllowance: salary.conveyanceAllowance,
              medicalAllowance: salary.medicalAllowance,
              specialAllowance: salary.specialAllowance,
              employerPF: salary.employerPF,
              employerESI: salary.employerESI,
              gratuity: salary.gratuity,
            },
          },
        },
      });

      createdEmployees.push({ id: employee.id, employeeCode: emp.employeeCode });

      // Create leave balances for every leave type
      await Promise.all(
        createdLeaveTypes.map((lt) =>
          db.leaveBalance.create({
            data: {
              employeeId: employee.id,
              leaveTypeId: lt.id,
              year: FINANCIAL_YEAR,
              totalAllocated: lt.totalDays,
              used: 0,
              carryForwarded: 0,
            },
          })
        )
      );
    }

    // --- 4. Create default users (idempotent — upsert, never wiped by re-seed) ---
    for (const u of DEFAULT_USERS) {
      const passwordHash = await hashPassword(u.password);
      await db.user.upsert({
        where: { email: u.email },
        update: {},
        create: { email: u.email, passwordHash, name: u.name, role: u.role },
      });
    }

    await logAudit({
      session,
      action: "process",
      entity: "Database",
      details: { message: "Demo data reset/seeded" },
    });

    // --- 5. Return summary ---
    return NextResponse.json({
      success: true,
      message: "Database seeded successfully",
      data: {
        company: 1,
        leaveTypes: createdLeaveTypes.length,
        employees: createdEmployees.length,
        salaryStructures: createdEmployees.length,
        leaveBalances: createdEmployees.length * createdLeaveTypes.length,
        defaultLoginNote:
          userCount === 0
            ? "Default accounts created: admin@payrollpro.local / Admin@12345 (admin), hr@payrollpro.local / HrManager@12345 (hr), manager@payrollpro.local / Manager@12345 (manager). Change these immediately in a real deployment."
            : undefined,
      },
    });
  } catch (error) {
    return handleApiError(error, "seed database");
  }
}
