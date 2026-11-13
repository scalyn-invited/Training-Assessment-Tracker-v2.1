import { Accounts } from './accounts.js';
import { sendSmtp } from './notification-mail.js';
import { requireCondition } from './errors.js';
export type AccountMessage = { to: string; purpose: string; url: string; expiresAt: Date };
export interface AccountMail {
  configured(): boolean;
  send(message: AccountMessage): Promise<void>;
}
export class SmtpAccountMail implements AccountMail {
  configured() {
    return (
      process.env.SMTP_ENABLED === 'true' &&
      process.env.ACCOUNT_MAIL_ENABLED === 'true' &&
      !!process.env.SMTP_HOST &&
      !!process.env.SMTP_FROM
    );
  }
  async send(m: AccountMessage) {
    if (!this.configured()) throw new Error('account_mail_disabled');
    await sendSmtp(
      m.to,
      'Your training account link',
      `Complete your ${m.purpose} request: ${m.url}\nExpires at ${m.expiresAt.toISOString()}. If unexpected, do not use this link.`,
    );
  }
}
export class AccountDelivery {
  constructor(
    readonly accounts: Accounts,
    readonly mail: AccountMail = new SmtpAccountMail(),
    readonly recipients = () =>
      (process.env.ACCOUNT_MAIL_RECIPIENTS || '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    readonly origin = process.env.APP_ORIGIN || 'http://127.0.0.1:3100',
  ) {}
  available() {
    return this.mail.configured();
  }
  async send(token: string, csrf: string, result: Awaited<ReturnType<Accounts['create']>>) {
    return this.accounts.auth.db.transaction(async (sql) => {
      await sql.query('SELECT environment FROM platform_settings WHERE environment=$1 FOR UPDATE', [
        this.accounts.environment(),
      ]);
      const link = await this.accounts.link(sql, result.token, result.purpose);
      if (link.organisation_id)
        await sql.query('SELECT id FROM organisations WHERE id=$1 FOR UPDATE', [
          link.organisation_id,
        ]);
      const { user: actor } = await this.accounts.auth.verified(sql, token, csrf);
      requireCondition(
        actor && actor.id === link.issuer_id && link.id === result.id,
        403,
        'link_issuer_required',
        'Only the issuing administrator can send this account link.',
      );
      await this.accounts.authorised(sql, actor, link.organisation_id);
      requireCondition(
        actor.permission_version === link.issuer_version,
        403,
        'link_authority_changed',
        'Link authority changed. Request a new link.',
      );
      const recipient = (
        await sql.query<{ id: string; email: string; is_synthetic: boolean }>(
          'SELECT id,email,is_synthetic FROM users WHERE id=$1 FOR UPDATE',
          [link.user_id],
        )
      ).rows[0];
      requireCondition(
        recipient &&
          (await this.accounts.access.active(sql, recipient.id, this.accounts.environment())) &&
          (await this.accounts.identity(sql, recipient.id)),
        403,
        'recipient_unavailable',
        'The recipient account is unavailable.',
      );
      if (
        !this.available() ||
        recipient.is_synthetic ||
        !this.recipients().includes(recipient.email.toLowerCase())
      )
        return 'Email was not sent. Delivery is disabled or this recipient is not approved. Share the private link manually.';
      let origin: URL;
      try {
        origin = new URL(this.origin);
      } catch {
        return 'Email was not sent. A secure application address is required. Share the private link manually.';
      }
      if (origin.protocol !== 'https:' || origin.username || origin.password)
        return 'Email was not sent. A secure application address is required. Share the private link manually.';
      // The raw link exists only in this request and the transport; never in a durable job or audit.
      const url = new URL('/account/link', origin.origin);
      url.hash = new URLSearchParams({ purpose: link.purpose, token: result.token }).toString();
      let accepted = false;
      try {
        await this.mail.send({
          to: recipient.email,
          purpose: link.purpose,
          url: url.href,
          expiresAt: link.expires_at,
        });
        accepted = true;
      } catch {
        accepted = false;
      }
      await this.accounts.platform.audit(
        sql,
        actor,
        accepted ? 'local.email.accepted' : 'local.email.failed',
        link.id,
        accepted
          ? 'Mail transport accepted the account link'
          : 'Mail transport did not confirm acceptance',
        {},
      );
      return accepted
        ? 'Email accepted by the mail server. Inbox delivery is not confirmed.'
        : 'Email delivery could not be confirmed. The link remains valid; share it privately or cancel and reissue it.';
    });
  }
}
