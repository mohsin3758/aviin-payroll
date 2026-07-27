import nodemailer, { type Transporter } from 'nodemailer';
import { db } from '@/lib/db';

const globalForMailer = globalThis as unknown as {
  etherealTransport: Promise<Transporter> | undefined;
};

/**
 * Ethereal test-account creation is a real network round-trip (registers a throwaway mailbox),
 * so — unlike real SMTP configs below — it's worth caching for the life of the process.
 */
function getEtherealTransport(): Promise<Transporter> {
  if (!globalForMailer.etherealTransport) {
    globalForMailer.etherealTransport = (async () => {
      const testAccount = await nodemailer.createTestAccount();
      return nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: { user: testAccount.user, pass: testAccount.pass },
      });
    })();
  }
  return globalForMailer.etherealTransport;
}

export interface EffectiveSmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string | null;
  pass: string | null;
  from: string;
}

/**
 * Resolves the SMTP config to actually use: admin-configured (via Settings, stored on the
 * Company row) takes priority over SMTP_* env vars, so a real deployment doesn't need VPS/env
 * access to turn on real email — just the Settings UI. Returns null if neither is set, meaning
 * the caller should fall back to the Ethereal test transport.
 */
export async function getEffectiveSmtpConfig(): Promise<EffectiveSmtpConfig | null> {
  const company = await db.company.findFirst({ orderBy: { createdAt: "asc" } });
  if (company?.smtpHost) {
    return {
      host: company.smtpHost,
      port: company.smtpPort ?? 587,
      secure: company.smtpSecure,
      user: company.smtpUser ?? null,
      pass: company.smtpPassword ?? null,
      from: company.smtpFrom || '"PayrollPro" <payroll@example.com>',
    };
  }
  if (process.env.SMTP_HOST) {
    return {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER ?? null,
      pass: process.env.SMTP_PASS ?? null,
      from: process.env.SMTP_FROM || '"PayrollPro" <payroll@example.com>',
    };
  }
  return null;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: string; contentType?: string }[];
}

export interface SendEmailResult {
  messageId: string;
  /** Only present when using the Ethereal test transport (no real SMTP configured anywhere). */
  previewUrl: string | null;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const config = await getEffectiveSmtpConfig();

  // Real SMTP configs are rebuilt per send (cheap — no connection until sendMail actually runs)
  // rather than cached, so a settings change via the UI takes effect immediately with no restart.
  const transport = config
    ? nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.user ? { user: config.user, pass: config.pass ?? undefined } : undefined,
      })
    : await getEtherealTransport();

  const info = await transport.sendMail({
    from: config?.from || '"PayrollPro" <payroll@example.com>',
    to: input.to,
    subject: input.subject,
    html: input.html,
    attachments: input.attachments,
  });

  const previewUrl = config ? null : nodemailer.getTestMessageUrl(info) || null;
  if (previewUrl) {
    console.log(`[mailer] Preview URL: ${previewUrl}`);
  }

  return { messageId: info.messageId, previewUrl };
}
