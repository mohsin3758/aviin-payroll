import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { requireRole, hashPassword } from "@/lib/auth";
import { apiError, handleApiError } from "@/lib/api-utils";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/mailer";

function generateTempPassword(): string {
  // 12 random bytes -> 16-char base64url string, comfortably over the 8-char minimum.
  return randomBytes(12).toString("base64url");
}

// POST /api/employees/[id]/activate-portal — admin/hr only. Creates a role="employee" login
// linked to this employee (if one doesn't already exist), with a random temp password, and
// emails it to them. This is the "onboarding portal activation" + "welcome email" step.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(request, ["admin", "hr"]);
    const { id: employeeId } = await params;

    const employee = await db.employee.findUnique({ where: { id: employeeId } });
    if (!employee) {
      return apiError("Employee not found", 404);
    }

    const existingLink = await db.user.findUnique({ where: { employeeId } });
    if (existingLink) {
      return apiError("This employee already has a portal login.", 409);
    }

    const existingEmail = await db.user.findUnique({ where: { email: employee.email } });
    if (existingEmail) {
      return apiError(`A login already exists for ${employee.email}, but it isn't linked to this employee record.`, 409);
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    const user = await db.user.create({
      data: {
        email: employee.email,
        name: `${employee.firstName} ${employee.lastName ?? ""}`.trim(),
        role: "employee",
        passwordHash,
        employeeId,
      },
      select: { id: true, email: true, name: true, role: true, employeeId: true, createdAt: true },
    });

    await logAudit({ session, action: "create", entity: "User", entityId: user.id, details: { employeeId, portalActivation: true } });

    const loginUrl = request.nextUrl.origin;
    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#222;">
        <h2 style="color:#059669;">Welcome to PayrollPro</h2>
        <p>Hi ${employee.firstName},</p>
        <p>Your employee self-service portal login has been created.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;background:#f9fafb;border-radius:8px;">
          <tr><td style="padding:8px 12px;color:#555;">Login URL</td><td style="padding:8px 12px;"><a href="${loginUrl}">${loginUrl}</a></td></tr>
          <tr><td style="padding:8px 12px;color:#555;">Email</td><td style="padding:8px 12px;">${employee.email}</td></tr>
          <tr><td style="padding:8px 12px;color:#555;">Temporary Password</td><td style="padding:8px 12px;font-family:monospace;">${tempPassword}</td></tr>
        </table>
        <p style="color:#b45309;">Please log in and change this password immediately from Settings once inside the portal.</p>
      </div>`;

    let previewUrl: string | null = null;
    try {
      const result = await sendEmail({ to: employee.email, subject: "Welcome to PayrollPro — Your Portal Login", html });
      previewUrl = result.previewUrl;
    } catch (emailError) {
      console.error("Failed to send welcome email:", emailError);
    }

    return NextResponse.json({ data: user, previewUrl }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "activate employee portal");
  }
}
