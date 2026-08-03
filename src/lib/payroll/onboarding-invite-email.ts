interface OnboardingInviteEmailData {
  employee: { firstName: string; lastName: string | null; designation: string; department: string; dateOfJoining: Date };
  company: { name: string };
  inviteUrl: string;
  expiresAt: Date;
}

const REQUIRED_DOC_LABELS = ["Photo", "PAN Card", "Aadhaar Card", "Bank Proof (cancelled cheque / passbook)", "Education Certificate"];

/** The one email template in this codebase with an actual clickable call-to-action button —
 * every other email here (offer/appointment/salary-slip/etc.) is a static formatted document,
 * not an action prompt. Styled closer to activate-portal's sans-serif/table layout (an
 * action email) than onboarding-letter-email's serif "formal letter" style. */
export function buildOnboardingInviteEmailHtml(data: OnboardingInviteEmailData): string {
  const { employee, company, inviteUrl, expiresAt } = data;
  const joinDate = employee.dateOfJoining.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
  const expiryDate = expiresAt.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

  return `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:0 auto;color:#222;line-height:1.6;">
  <div style="text-align:center;border-bottom:2px solid #059669;padding-bottom:12px;margin-bottom:20px;">
    <h2 style="margin:0;color:#059669;">${company.name}</h2>
  </div>
  <p>Hi ${employee.firstName},</p>
  <p>Welcome aboard! You're joining as <strong>${employee.designation}</strong> in the <strong>${employee.department}</strong> department, effective <strong>${joinDate}</strong>.</p>
  <p>To get started, please complete your onboarding by filling in your details and uploading a few required documents.</p>
  <div style="text-align:center;margin:28px 0;">
    <a href="${inviteUrl}" style="background:#059669;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:bold;display:inline-block;">Complete Your Onboarding</a>
  </div>
  <p style="font-size:13px;color:#666;">Or copy this link into your browser: <a href="${inviteUrl}">${inviteUrl}</a></p>
  <p style="color:#b45309;">This link expires on <strong>${expiryDate}</strong>. Contact HR if you need it resent.</p>
  <div style="background:#f9fafb;border-radius:8px;padding:16px;margin-top:20px;">
    <p style="margin:0 0 8px;font-weight:bold;">You'll need to upload:</p>
    <ul style="margin:0;padding-left:20px;">
      ${REQUIRED_DOC_LABELS.map((label) => `<li>${label}</li>`).join("")}
    </ul>
  </div>
  <p style="margin-top:24px;">Looking forward to having you on the team.</p>
  <p>Warm regards,<br/>Human Resources<br/>${company.name}</p>
</div>`;
}
