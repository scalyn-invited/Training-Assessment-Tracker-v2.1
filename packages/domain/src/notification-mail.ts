import nodemailer from 'nodemailer';
export type NoticeMessage = { to: string; url: string };
export interface NoticeMail {
  configured(): boolean;
  send(message: NoticeMessage): Promise<void>;
}
export function mailOutcome(
  error: unknown,
  attempts: number,
): { status: 'pending' | 'failed' | 'ambiguous'; code: string } {
  const code =
    typeof error === 'object' && error !== null && 'responseCode' in error
      ? error.responseCode
      : null;
  if (typeof code !== 'number' || !Number.isInteger(code) || code < 400 || code > 599)
    return { status: 'ambiguous', code: 'smtp_outcome_unknown' };
  if (code < 500 && attempts < 4) return { status: 'pending', code: 'smtp_transient_rejection' };
  return { status: 'failed', code: 'smtp_rejected' };
}
export class SmtpNoticeMail implements NoticeMail {
  configured() {
    return (
      process.env.NODE_ENV === 'production' &&
      process.env.SMTP_ENABLED === 'true' &&
      !!process.env.SMTP_HOST &&
      !!process.env.SMTP_FROM
    );
  }
  async send(message: NoticeMessage) {
    if (!this.configured()) throw new Error('smtp_not_configured');
    await sendSmtp(
      message.to,
      'Training review update',
      'A training update is ready. Sign in to review: ' + message.url,
    );
  }
}

export async function sendSmtp(to: string, subject: string, text: string) {
  const port = Number(process.env.SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('smtp_invalid_port');
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: true,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || '' }
      : undefined,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 60000,
    logger: false,
    debug: false,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      text,
      signal: AbortSignal.timeout(90000),
    });
  } finally {
    transport.close();
  }
}
