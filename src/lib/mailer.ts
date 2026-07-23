import nodemailer, { type Transporter } from 'nodemailer';

const globalForMailer = globalThis as unknown as {
  mailerTransport: Promise<Transporter> | undefined;
};

/**
 * Lazily builds a singleton SMTP transporter.
 *
 * If SMTP_HOST/SMTP_USER/SMTP_PASS are set (production), it connects to that
 * real mail server. Otherwise it provisions a free Ethereal test inbox on the
 * fly, so email sending is genuinely testable end-to-end without needing any
 * real credentials — every send prints a preview URL you can open in a browser.
 */
function getTransport(): Promise<Transporter> {
  if (!globalForMailer.mailerTransport) {
    globalForMailer.mailerTransport = (async () => {
      if (process.env.SMTP_HOST) {
        return nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: process.env.SMTP_USER
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
            : undefined,
        });
      }

      const testAccount = await nodemailer.createTestAccount();
      return nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: { user: testAccount.user, pass: testAccount.pass },
      });
    })();
  }
  return globalForMailer.mailerTransport;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: string; contentType?: string }[];
}

export interface SendEmailResult {
  messageId: string;
  /** Only present when using the Ethereal test transport (no real SMTP configured). */
  previewUrl: string | null;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const transport = await getTransport();
  const info = await transport.sendMail({
    from: process.env.SMTP_FROM || '"PayrollPro" <payroll@example.com>',
    to: input.to,
    subject: input.subject,
    html: input.html,
    attachments: input.attachments,
  });

  const previewUrl = process.env.SMTP_HOST ? null : nodemailer.getTestMessageUrl(info) || null;
  if (previewUrl) {
    console.log(`[mailer] Preview URL: ${previewUrl}`);
  }

  return { messageId: info.messageId, previewUrl };
}
