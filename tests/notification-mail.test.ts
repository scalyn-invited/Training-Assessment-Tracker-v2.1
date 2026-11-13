import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ sendMail: vi.fn(), close: vi.fn(), createTransport: vi.fn() }));
vi.mock('nodemailer', () => ({ default: { createTransport: mocks.createTransport } }));
import { SmtpNoticeMail } from '../packages/domain/src/notification-mail.js';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it('keeps SMTP disabled by default and requires production mode', async () => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('SMTP_ENABLED', 'true');
  vi.stubEnv('SMTP_HOST', 'mail.example.invalid');
  vi.stubEnv('SMTP_FROM', 'training@example.invalid');
  const mail = new SmtpNoticeMail();
  expect(mail.configured()).toBe(false);
  await expect(
    mail.send({ to: 'user@example.invalid', url: 'https://training.example.invalid' }),
  ).rejects.toThrow('smtp_not_configured');
  expect(mocks.createTransport).not.toHaveBeenCalled();
});
it('prepares bounded TLS SMTP with no content, URLs or files fetched and closes the transport', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('SMTP_ENABLED', 'true');
  vi.stubEnv('SMTP_HOST', 'mail.example.invalid');
  vi.stubEnv('SMTP_PORT', '587');
  vi.stubEnv('SMTP_FROM', 'training@example.invalid');
  mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail, close: mocks.close });
  mocks.sendMail.mockResolvedValue({ accepted: ['user@example.invalid'] });
  await new SmtpNoticeMail().send({
    to: 'user@example.invalid',
    url: 'https://training.example.invalid/assessments',
  });
  expect(mocks.createTransport).toHaveBeenCalledWith(
    expect.objectContaining({
      secure: false,
      requireTLS: true,
      disableFileAccess: true,
      disableUrlAccess: true,
      logger: false,
      debug: false,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 60000,
    }),
  );
  expect(mocks.sendMail).toHaveBeenCalledWith(
    expect.objectContaining({
      subject: 'Training review update',
      text: 'A training update is ready. Sign in to review: https://training.example.invalid/assessments',
      signal: expect.any(AbortSignal),
    }),
  );
  expect(mocks.close).toHaveBeenCalledOnce();
  mocks.sendMail.mockRejectedValue({ responseCode: 421 });
  await expect(
    new SmtpNoticeMail().send({
      to: 'user@example.invalid',
      url: 'https://training.example.invalid/assessments',
    }),
  ).rejects.toEqual({ responseCode: 421 });
  expect(mocks.close).toHaveBeenCalledTimes(2);
});
