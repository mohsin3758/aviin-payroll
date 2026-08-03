import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { apiError, getDefaultCompanyId, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/mailer";
import { generateNextEmployeeCode } from "@/lib/employee-code";
import { generateInviteToken, hashInviteToken, newExpiry } from "@/lib/onboarding-invite";
import { createOnboardingInviteSchema } from "@/lib/validations/onboarding-invite";
import { buildOnboardingInviteEmailHtml } from "@/lib/payroll/onboarding-invite-email";

// GET /api/onboarding-invites?status= — admin/hr only. Company-wide list of every invite, so
// HR has one place to see everyone mid-onboarding rather than checking one employee at a time.
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, ["admin", "hr"]);
    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status");

    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    const invites = await db.onboardingInvite.findMany({
      where,
      include: {
        employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true, email: true, designation: true, department: true, onboardingStatus: true } },
        candidate: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const now = new Date();
    const data = invites.map((inv) => ({ ...inv, isExpired: inv.expiresAt < now }));

    return NextResponse.json({ data });
  } catch (error) {
    return handleApiError(error, "fetch onboarding invites");
  }
}

// POST /api/onboarding-invites — admin/hr only. Creates the Employee (onboardingStatus:
// "onboarding") + the invite in one step, emails the link, and always returns the raw
// inviteUrl directly (mirrors activate-portal returning its temp password) so HR isn't stuck
// if the email silently fails to send.
export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const body = await request.json();
    const parsed = createOnboardingInviteSchema.parse(body);

    if (parsed.candidateId) {
      const candidate = await db.candidate.findUnique({ where: { id: parsed.candidateId } });
      if (!candidate) return apiError("Candidate not found.", 404);
    }

    const companyId = await getDefaultCompanyId();
    const company = await db.company.findFirst({ orderBy: { createdAt: "asc" } });

    const existingEmail = await db.employee.findFirst({ where: { email: parsed.email, dateOfExit: null } });
    if (existingEmail) {
      return apiError("An active employee with this email already exists.", 409);
    }

    const employeeCode = await generateNextEmployeeCode();

    const rawToken = generateInviteToken();

    const { employee, invite } = await db.$transaction(async (tx) => {
      const employee = await tx.employee.create({
        data: {
          companyId,
          employeeCode,
          firstName: parsed.firstName,
          lastName: parsed.lastName ?? null,
          email: parsed.email,
          phone: parsed.phone ?? null,
          designation: parsed.designation,
          department: parsed.department,
          client: parsed.client ?? null,
          employmentType: parsed.employmentType,
          dateOfJoining: parsed.dateOfJoining,
          onboardingStatus: "onboarding",
        },
      });
      const invite = await tx.onboardingInvite.create({
        data: {
          employeeId: employee.id,
          candidateId: parsed.candidateId ?? null,
          tokenHash: hashInviteToken(rawToken),
          expiresAt: newExpiry(),
          createdBy: session.userId,
        },
      });
      return { employee, invite };
    });

    await logAudit({ session, action: "create", entity: "OnboardingInvite", entityId: invite.id, details: { employeeId: employee.id, employeeCode } });

    const inviteUrl = `${request.nextUrl.origin}/onboard/${rawToken}`;
    let previewUrl: string | null = null;
    try {
      const html = buildOnboardingInviteEmailHtml({
        employee: { firstName: employee.firstName, lastName: employee.lastName, designation: employee.designation, department: employee.department, dateOfJoining: employee.dateOfJoining },
        company: { name: company?.name ?? "PayrollPro" },
        inviteUrl,
        expiresAt: invite.expiresAt,
      });
      const result = await sendEmail({ to: employee.email, subject: `Welcome to ${company?.name ?? "the team"} — Complete Your Onboarding`, html });
      previewUrl = result.previewUrl;
    } catch (emailError) {
      console.error("Failed to send onboarding invite email:", emailError);
    }

    return NextResponse.json({ data: { invite, employee, inviteUrl, previewUrl } }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "create onboarding invite");
  }
}
