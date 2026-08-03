interface PasswordResetEmailData {
  userName: string;
  company: { name: string };
  resetUrl: string;
  expiresAt: Date;
}

// Mirrors buildOnboardingInviteEmailHtml's "action email with a button" style — the two email
// templates in this codebase that prompt a click rather than present a static document.
export function buildPasswordResetEmailHtml(data: PasswordResetEmailData): string {
  const { userName, company, resetUrl, expiresAt } = data;
  const expiryTime = expiresAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

  return `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:0 auto;color:#222;line-height:1.6;">
  <div style="text-align:center;border-bottom:2px solid #059669;padding-bottom:12px;margin-bottom:20px;">
    <h2 style="margin:0;color:#059669;">${company.name}</h2>
  </div>
  <p>Hi ${userName},</p>
  <p>We received a request to reset your password. Click below to choose a new one.</p>
  <div style="text-align:center;margin:28px 0;">
    <a href="${resetUrl}" style="background:#059669;color:#fff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:bold;display:inline-block;">Reset Your Password</a>
  </div>
  <p style="font-size:13px;color:#666;">Or copy this link into your browser: <a href="${resetUrl}">${resetUrl}</a></p>
  <p style="color:#b45309;">This link expires at <strong>${expiryTime}</strong> (about 60 minutes from now).</p>
  <p style="margin-top:24px;font-size:13px;color:#666;">If you didn't request this, you can safely ignore this email — your password won't change unless you click the link above and choose a new one.</p>
</div>`;
}
