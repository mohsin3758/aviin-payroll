import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createHiringIncentiveSchema } from "@/lib/validations/hiring-incentive";
import { apiError, getDefaultCompanyId, handleApiError } from "@/lib/api-utils";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { computeIncentiveSchedule, refreshPendingHiringIncentiveVesting, resolveIncentiveRate } from "@/lib/payroll/hiring-incentive";

const RECRUITER_SUMMARY = {
  select: { firstName: true, lastName: true, employeeCode: true },
} as const;

const CANDIDATE_SUMMARY = {
  select: { id: true, firstName: true, lastName: true, client: true, role: true, dateOfJoining: true, employmentType: true },
} as const;

// GET /api/hiring-incentives?recruiterId=&candidateId=&status=&month=&year= — admin/hr only.
// Refreshes pending records' vesting status against each candidate's current dateOfExit before
// listing, so status is always current even if no payroll run has touched them yet.
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ["admin", "hr"]);
    await refreshPendingHiringIncentiveVesting();

    const { searchParams } = request.nextUrl;
    const recruiterId = searchParams.get("recruiterId");
    const candidateId = searchParams.get("candidateId");
    const status = searchParams.get("status");
    const month = searchParams.get("month");
    const year = searchParams.get("year");

    const where: Record<string, unknown> = {};
    if (recruiterId) where.recruiterId = recruiterId;
    if (candidateId) where.candidateId = candidateId;
    if (status) where.status = status;
    if (month) where.payMonth = Number(month);
    if (year) where.payYear = Number(year);

    const incentives = await db.hiringIncentive.findMany({
      where,
      include: {
        recruiter: RECRUITER_SUMMARY,
        candidate: CANDIDATE_SUMMARY,
        paidInRun: { select: { month: true, year: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: incentives });
  } catch (error) {
    return handleApiError(error, "fetch hiring incentives");
  }
}

// POST /api/hiring-incentives — admin/hr only. Schedules a one-time recruiter payout for
// successfully closing (placing) a candidate. The recruiter is a real in-house Employee (the
// payout runs through their actual payroll); the candidate is a lightweight Candidate record
// (an externally-placed contract/full-time hire, not an Employee). Amount/dates are always
// server-computed from the configured rates and the candidate's record — never trusted from
// the client, since this determines a real cash payout.
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const body = await request.json();
    const parsed = createHiringIncentiveSchema.parse(body);

    const [recruiter, candidate] = await Promise.all([
      db.employee.findUnique({ where: { id: parsed.recruiterId } }),
      db.candidate.findUnique({ where: { id: parsed.candidateId } }),
    ]);
    if (!recruiter) return apiError("Recruiter not found.", 404);
    if (!candidate) return apiError("Candidate not found.", 404);
    if (candidate.dateOfExit) {
      return apiError("Cannot schedule a hiring incentive for a candidate whose placement has already ended.", 400);
    }

    const existingActive = await db.hiringIncentive.findFirst({
      where: { candidateId: parsed.candidateId, status: { not: "cancelled" } },
    });
    if (existingActive) {
      return apiError("A hiring incentive already exists for this candidate.", 400);
    }

    const companyId = await getDefaultCompanyId();
    const company = await db.company.findUniqueOrThrow({ where: { id: companyId } });

    const amount = resolveIncentiveRate(candidate.employmentType, {
      fteRate: company.hiringIncentiveFteRate,
      contractRate: company.hiringIncentiveContractRate,
    });
    if (amount === null) {
      return apiError(
        `No hiring incentive rate is configured for employment type "${candidate.employmentType}".`,
        400
      );
    }

    const { eligibleDate, payMonth, payYear } = computeIncentiveSchedule(candidate.dateOfJoining);

    const incentive = await db.hiringIncentive.create({
      data: {
        recruiterId: parsed.recruiterId,
        candidateId: parsed.candidateId,
        employmentType: candidate.employmentType,
        amount,
        joinDate: candidate.dateOfJoining,
        eligibleDate,
        payMonth,
        payYear,
        reason: parsed.reason ?? null,
        monthlySalary: parsed.monthlySalary ?? null,
        annualSalary: parsed.annualSalary ?? null,
      },
      include: { recruiter: RECRUITER_SUMMARY, candidate: CANDIDATE_SUMMARY },
    });

    await logAudit({
      session,
      action: "create",
      entity: "HiringIncentive",
      entityId: incentive.id,
      details: { recruiterId: parsed.recruiterId, candidateId: parsed.candidateId, amount, payMonth, payYear },
    });

    return NextResponse.json(incentive, { status: 201 });
  } catch (error) {
    return handleApiError(error, "create hiring incentive");
  }
}
