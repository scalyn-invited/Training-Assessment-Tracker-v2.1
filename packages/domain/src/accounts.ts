import { randomUUID } from 'node:crypto';
import type { Sql } from '../../database/src/database.js';
import { Auth, type AuthUser } from './auth.js';
import { Access, globalAdmin } from './access.js';
import { Platform } from './platform.js';
import { invalidate } from './tenancy.js';
import { digest, secret, passwordMatches, passwordHash } from './crypto.js';
import { requireCondition, DomainError } from './errors.js';
type Purpose = 'setup' | 'reset' | 'invite';
type Account = AuthUser & { password_hash: string; password_enabled: boolean };
type Link = {
  id: string;
  user_id: string;
  issuer_id: string;
  issuer_version: number;
  organisation_id: string | null;
  environment: string;
  purpose: Purpose;
  expires_at: Date;
  bootstrap: boolean;
};
export class Accounts {
  readonly access = new Access();
  readonly platform: Platform;
  constructor(readonly auth: Auth) {
    this.platform = new Platform(auth);
  }
  environment() {
    return process.env.NODE_ENV === 'production' ? 'production' : 'test';
  }
  async identity(sql: Sql, user: string) {
    return Boolean(
      (
        await sql.query(
          "SELECT id FROM identities WHERE user_id=$1::uuid AND issuer='urn:training:local' AND subject=$1::text AND active",
          [user],
        )
      ).rowCount,
    );
  }
  async authorised(sql: Sql, actor: AuthUser, client: string | null) {
    requireCondition(
      (await this.access.active(sql, actor.id, actor.environment)) &&
        (client
          ? await this.access.administer(sql, actor, client)
          : await globalAdmin(sql, actor.id, actor.environment)),
      403,
      'administrator_authority_missing',
      'Your account no longer has administrator authority for this action.',
    );
  }
  async recordDenial(token: string, error: unknown, raw?: string) {
    if (!(error instanceof DomainError) || error.status !== 403) return;
    await this.auth.db.transaction(async (sql) => {
      const actor =
        (
          await sql.query<{ user_id: string | null }>(
            'SELECT user_id FROM sessions WHERE token_hash=$1',
            [digest(token)],
          )
        ).rows[0]?.user_id ?? null;
      const link = raw
        ? (
            await sql.query<{ id: string }>(
              'SELECT id FROM local_account_links WHERE token_hash=$1 AND environment=$2',
              [digest(raw), this.environment()],
            )
          ).rows[0]?.id
        : null;
      await sql.query(
        'INSERT INTO platform_audit_events(id,environment,actor_id,operator_reference,action,target_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [
          randomUUID(),
          this.environment(),
          actor,
          raw ? 'local-link-redemption' : 'local-account-action',
          raw ? 'local.redemption.denied' : 'local.authorisation.denied',
          link ?? actor ?? 'unavailable',
          'Local account action denied: ' + error.code,
        ],
      );
    });
  }
  async mutation<T>(
    token: string,
    csrf: string,
    client: string | null,
    password: string,
    reason: string,
    operation: (sql: Sql, actor: Account) => Promise<T>,
  ) {
    this.auth.assertLocalPassword();
    this.platform.reason(reason);
    await this.auth.limit('account-action:' + digest(token));
    return this.auth.db
      .transaction(async (sql) => {
        await sql.query(
          'SELECT environment FROM platform_settings WHERE environment=$1 FOR UPDATE',
          [this.environment()],
        );
        if (client)
          await sql.query('SELECT id FROM organisations WHERE id=$1 FOR UPDATE', [client]);
        const { user, session } = await this.auth.verified(sql, token, csrf);
        const actor = user as Account;
        requireCondition(
          (await globalAdmin(sql, actor.id, actor.environment)) ||
            session.organisation_id === client,
          403,
          'client_context_required',
          'Choose this client before managing its accounts.',
        );
        await this.authorised(sql, actor, client);
        requireCondition(
          actor.password_enabled && (await passwordMatches(password, actor.password_hash)),
          403,
          'current_password_mismatch',
          'Your current password could not be confirmed. Enter your own sign-in password.',
        );
        return operation(sql, actor);
      })
      .catch(async (error) => {
        await this.recordDenial(token, error);
        throw error;
      });
  }
  async issue(
    sql: Sql,
    actor: AuthUser,
    user: Account,
    purpose: Purpose,
    client: string | null,
    reason: string,
    bootstrap = false,
  ) {
    await sql.query(
      "UPDATE local_account_links SET revoked_at=now() WHERE user_id=$1 AND purpose=$2 AND consumed_at IS NULL AND revoked_at IS NULL AND ($2<>'invite' OR organisation_id=$3)",
      [user.id, purpose, client],
    );
    const raw = secret(),
      id = randomUUID();
    const result = await sql.query<{ expires_at: Date }>(
      "INSERT INTO local_account_links(id,token_hash,purpose,user_id,issuer_id,issuer_version,organisation_id,environment,bootstrap,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+CASE WHEN $3='invite' THEN interval '7 days' ELSE interval '1 hour' END) RETURNING expires_at",
      [
        id,
        digest(raw),
        purpose,
        user.id,
        actor.id,
        actor.permission_version,
        client,
        actor.environment,
        bootstrap,
      ],
    );
    await this.platform.audit(sql, actor, 'local.' + purpose + '.issued', id, reason, {});
    // A fragment keeps the credential out of server URLs, referrers and access logs.
    return {
      id,
      purpose,
      token: raw,
      path: '/account/link#' + new URLSearchParams({ purpose, token: raw }).toString(),
      expiresAt: result.rows[0].expires_at,
    };
  }
  async create(
    token: string,
    csrf: string,
    data: {
      clientId: string;
      name: string;
      email: string;
      password: string;
      reason: string;
      mode: 'new' | 'existing';
      synthetic: boolean;
    },
  ) {
    const email = data.email.trim().toLowerCase();
    requireCondition(
      ['new', 'existing'].includes(data.mode) &&
        email.length <= 200 &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
        data.name.length <= 120 &&
        (data.mode === 'existing' || data.name.trim().length > 0),
      422,
      'invalid_account',
      'Enter the account name and valid email.',
    );
    requireCondition(
      this.environment() !== 'production' || !data.synthetic,
      422,
      'invalid_classification',
      'Test accounts cannot be created in production.',
    );
    return this.mutation(
      token,
      csrf,
      data.clientId,
      data.password,
      data.reason,
      async (sql, actor) => {
        let user = (
          await sql.query<Account>('SELECT * FROM users WHERE lower(email)=$1 FOR UPDATE', [email])
        ).rows[0];
        requireCondition(
          data.mode === 'new' ? !user : user,
          409,
          'account_mode_mismatch',
          data.mode === 'new'
            ? 'This account already exists. Choose Existing account.'
            : 'No account matches this email. Choose New account.',
        );
        if (user) {
          requireCondition(
            (await this.access.active(sql, user.id, actor.environment)) &&
              user.password_enabled &&
              (await this.identity(sql, user.id)),
            409,
            'identity_review',
            'This account requires setup or identity review.',
          );
          requireCondition(
            !(await this.access.membership(sql, user.id, data.clientId, actor.environment)),
            409,
            'already_joined',
            'This account already has access.',
          );
          return this.issue(sql, actor, user, 'invite', data.clientId, data.reason);
        }
        const id = randomUUID();
        user = (
          await sql.query<Account>(
            "INSERT INTO users(id,name,email,password_hash,password_enabled,environment,is_synthetic) VALUES($1,$2,$3,'unconfigured',false,$4,$5) RETURNING *",
            [id, data.name.trim(), email, actor.environment, data.synthetic],
          )
        ).rows[0];
        await sql.query(
          "INSERT INTO identities(id,user_id,issuer,subject) VALUES($1,$2::uuid,'urn:training:local',$2::text)",
          [randomUUID(), id],
        );
        return this.issue(sql, actor, user, 'setup', data.clientId, data.reason);
      },
    );
  }
  async mayRecover(
    sql: Sql,
    actor: AuthUser,
    user: Account,
    client: string | null,
    purpose: 'setup' | 'reset',
  ) {
    requireCondition(
      actor.id !== user.id && (await this.access.active(sql, user.id, actor.environment)),
      403,
      'recovery_denied',
      'This account cannot be recovered through this action.',
    );
    if (!(await globalAdmin(sql, actor.id, actor.environment))) {
      requireCondition(
        client && !(await globalAdmin(sql, user.id, actor.environment)),
        403,
        'recovery_denied',
        'Global administrator recovery requires a separate Global Admin.',
      );
      if (purpose === 'setup')
        requireCondition(
          (
            await sql.query(
              "SELECT id FROM local_account_links WHERE user_id=$1 AND issuer_id=$2 AND organisation_id=$3 AND purpose='setup'",
              [user.id, actor.id, client],
            )
          ).rowCount,
          403,
          'setup_issuer_required',
          'Only the creating administrator can reissue this setup link.',
        );
      else
        requireCondition(
          await this.access.membership(sql, user.id, client!, actor.environment),
          403,
          'recovery_denied',
          'The account is not an active member of this client.',
        );
    }
    requireCondition(
      purpose === 'setup' ? !user.password_enabled : user.password_enabled,
      409,
      'password_state_changed',
      'The account setup state has changed.',
    );
    requireCondition(
      await this.identity(sql, user.id),
      422,
      'identity_review',
      'External accounts require separate identity review.',
    );
  }
  async recover(
    token: string,
    csrf: string,
    data: {
      userId: string;
      clientId: string | null;
      purpose: 'setup' | 'reset';
      password: string;
      reason: string;
    },
  ) {
    requireCondition(
      ['setup', 'reset'].includes(data.purpose) && (data.purpose !== 'setup' || data.clientId),
      422,
      'invalid_recovery',
      'Choose a valid purpose and initial client.',
    );
    return this.mutation(
      token,
      csrf,
      data.clientId,
      data.password,
      data.reason,
      async (sql, actor) => {
        const user = (
          await sql.query<Account>(
            'SELECT * FROM users WHERE id=$1 AND environment=$2 FOR UPDATE',
            [data.userId, actor.environment],
          )
        ).rows[0];
        requireCondition(user, 404, 'account_unavailable', 'The account is unavailable.');
        await this.mayRecover(sql, actor, user, data.clientId, data.purpose);
        return this.issue(sql, actor, user, data.purpose, data.clientId, data.reason);
      },
    );
  }
  async link(sql: Sql, raw: string, purpose: Purpose) {
    this.auth.assertLocalPassword();
    requireCondition(
      /^[a-f0-9]{64}$/.test(raw) && ['setup', 'reset', 'invite'].includes(purpose),
      410,
      'link_unavailable',
      'This link is unavailable. Request a new link.',
    );
    const link = (
      await sql.query<Link>(
        'SELECT * FROM local_account_links WHERE token_hash=$1 AND purpose=$2 AND environment=$3 AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>now() FOR UPDATE',
        [digest(raw), purpose, this.environment()],
      )
    ).rows[0];
    requireCondition(
      link,
      410,
      'link_unavailable',
      'This link is unavailable or expired. Request a new link.',
    );
    return link;
  }
  async inspect(token: string, csrf: string, raw: string, purpose: Purpose) {
    this.auth.assertLocalPassword();
    return this.auth.db.transaction(async (sql) => {
      const { user } = await this.auth.verified(sql, token, csrf, purpose === 'invite');
      const link = await this.link(sql, raw, purpose);
      requireCondition(
        purpose !== 'invite' || user?.id === link.user_id,
        403,
        'wrong_recipient',
        'Sign in as the intended recipient.',
      );
      const recipient = (
        await sql.query('SELECT name,email FROM users WHERE id=$1', [link.user_id])
      ).rows[0];
      const client = link.organisation_id
        ? (await sql.query('SELECT name FROM organisations WHERE id=$1', [link.organisation_id]))
            .rows[0]?.name
        : null;
      return { purpose, recipient, client, expiresAt: link.expires_at };
    });
  }
  async join(sql: Sql, actor: AuthUser, user: Account, client: string) {
    requireCondition(
      !(await this.access.membership(sql, user.id, client, actor.environment)),
      409,
      'already_joined',
      'This account already has access.',
    );
    const previous = (
      await sql.query(
        'SELECT id,status FROM client_memberships WHERE user_id=$1 AND organisation_id=$2 AND environment=$3',
        [user.id, client, actor.environment],
      )
    ).rows[0];
    let id: string;
    if (previous) {
      requireCondition(
        previous.status === 'ended',
        409,
        'membership_changed',
        'Membership changed. Request administrator review.',
      );
      id = previous.id;
      await sql.query(
        "UPDATE client_memberships SET status='active',joined_at=now(),ended_at=NULL,version=version+1 WHERE id=$1",
        [id],
      );
    } else {
      id = randomUUID();
      await sql.query(
        'INSERT INTO client_memberships(id,user_id,organisation_id,environment) VALUES($1,$2,$3,$4)',
        [id, user.id, client, actor.environment],
      );
    }
    await sql.query(
      "INSERT INTO role_assignments(id,user_id,role,organisation_id,environment,client_membership_id,scope_type,scope_key,granted_by,reason) VALUES($1,$2,'member',$3,$4,$5,'client',$6,$7,'Recipient accepted Member role')",
      [randomUUID(), user.id, client, actor.environment, id, 'client:' + client, actor.id],
    );
    await invalidate(sql, [user.id]);
  }
  async redeem(
    token: string,
    csrf: string,
    raw: string,
    purpose: Purpose,
    password?: string,
    confirmation?: string,
  ) {
    requireCondition(
      purpose === 'invite' || password === confirmation,
      422,
      'password_confirmation',
      'The passwords must match.',
    );
    const hash = purpose === 'invite' ? null : await passwordHash(password ?? '');
    return this.auth.db
      .transaction(async (sql) => {
        await sql.query(
          'SELECT environment FROM platform_settings WHERE environment=$1 FOR UPDATE',
          [this.environment()],
        );
        const link = await this.link(sql, raw, purpose);
        if (link.organisation_id)
          await sql.query('SELECT id FROM organisations WHERE id=$1 FOR UPDATE', [
            link.organisation_id,
          ]);
        const { user: recipient } = await this.auth.verified(
          sql,
          token,
          csrf,
          purpose === 'invite',
        );
        const issuer = (
          await sql.query<Account>('SELECT * FROM users WHERE id=$1 FOR UPDATE', [link.issuer_id])
        ).rows[0];
        const target = (
          await sql.query<Account>('SELECT * FROM users WHERE id=$1 FOR UPDATE', [link.user_id])
        ).rows[0];
        await this.authorised(sql, issuer, link.organisation_id);
        requireCondition(
          issuer.permission_version === link.issuer_version,
          403,
          'link_authority_changed',
          'Link authority changed. Request a new link.',
        );
        requireCondition(
          (await this.access.active(sql, target.id, this.environment())) &&
            (await this.identity(sql, target.id)),
          403,
          'recipient_unavailable',
          'The recipient account is unavailable.',
        );
        if (purpose === 'invite') {
          requireCondition(
            recipient?.id === target.id && target.password_enabled,
            403,
            'wrong_recipient',
            'Sign in as the intended recipient.',
          );
          await this.join(sql, issuer, target, link.organisation_id!);
        } else {
          if (link.bootstrap) {
            requireCondition(
              purpose === 'setup' &&
                !link.organisation_id &&
                issuer.id === target.id &&
                !target.password_enabled &&
                (await globalAdmin(sql, target.id, target.environment)),
              403,
              'bootstrap_setup_unavailable',
              'Initial administrator setup is no longer available.',
            );
          } else await this.mayRecover(sql, issuer, target, link.organisation_id, purpose);
          await sql.query('UPDATE users SET password_hash=$2,password_enabled=true WHERE id=$1', [
            target.id,
            hash,
          ]);
          if (purpose === 'setup' && !link.bootstrap)
            await this.join(sql, issuer, target, link.organisation_id!);
          await invalidate(sql, [target.id]);
          await sql.query(
            "UPDATE local_account_links SET revoked_at=now() WHERE user_id=$1 AND purpose IN ('setup','reset') AND consumed_at IS NULL AND id<>$2",
            [target.id, link.id],
          );
        }
        await sql.query('UPDATE local_account_links SET consumed_at=now() WHERE id=$1', [link.id]);
        await sql.query('DELETE FROM sessions WHERE token_hash=$1', [digest(token)]);
        await this.platform.audit(
          sql,
          issuer,
          'local.' + purpose + '.consumed',
          link.id,
          'Recipient completed local account action',
          {},
        );
        return { completed: true };
      })
      .catch(async (error) => {
        await this.recordDenial(token, error, raw);
        throw error;
      });
  }

  async manage(token: string, client: string | null, page = 1, search = '') {
    this.auth.assertLocalPassword();
    requireCondition(
      Number.isInteger(page) && page > 0 && search.length <= 120,
      422,
      'invalid_filter',
      'Choose a valid page or search.',
    );
    return this.auth.db.transaction(async (sql) => {
      const { user, session } = await this.auth.verified(sql, token);
      const actor = user!;
      const global = await globalAdmin(sql, actor.id, actor.environment);
      const selected = global ? client : session.organisation_id;
      await this.authorised(sql, actor, selected);
      const scope =
        'l.environment=$1 AND ($2::uuid IS NULL OR l.organisation_id=$2) AND ($3 OR l.issuer_id=$4)';
      const params = [actor.environment, selected, global, actor.id];
      const links = (
        await sql.query(
          `SELECT l.id,l.purpose,l.organisation_id,l.expires_at,l.consumed_at,l.revoked_at,l.created_at,u.name,u.email
    FROM local_account_links l JOIN users u ON u.id=l.user_id WHERE ${scope} ORDER BY l.created_at DESC,l.id LIMIT 20 OFFSET $5`,
          [...params, (page - 1) * 20],
        )
      ).rows;
      const total = (
        await sql.query(
          `SELECT count(*)::int total FROM local_account_links l WHERE ${scope}`,
          params,
        )
      ).rows[0].total;
      const clients = (
        await sql.query(
          `SELECT o.id,o.name FROM organisations o JOIN platform_client_states s ON s.organisation_id=o.id WHERE o.active AND NOT s.suspended AND s.environment=$1
    AND ($2 OR EXISTS(SELECT 1 FROM client_memberships cm JOIN role_assignments r ON r.client_membership_id=cm.id WHERE cm.user_id=$3 AND cm.organisation_id=o.id AND cm.environment=s.environment AND cm.status='active' AND cm.ended_at IS NULL AND cm.joined_at<=now() AND r.role='admin' AND r.scope_type='client' AND r.starts_at<=now() AND (r.ends_at IS NULL OR r.ends_at>now()))) ORDER BY o.name`,
          [actor.environment, global, actor.id],
        )
      ).rows;
      const candidates = (
        await sql.query<Account>(
          `SELECT u.* FROM users u WHERE u.environment=$1 AND u.active AND u.id<>$2 AND (u.name ILIKE $3 OR u.email ILIKE $3)
    AND EXISTS(SELECT 1 FROM identities i WHERE i.user_id=u.id AND i.issuer='urn:training:local' AND i.subject=u.id::text AND i.active)
    AND ($4 OR EXISTS(SELECT 1 FROM client_memberships cm WHERE cm.user_id=u.id AND cm.organisation_id=$5 AND cm.environment=u.environment AND cm.status='active' AND cm.ended_at IS NULL AND cm.joined_at<=now())
      OR EXISTS(SELECT 1 FROM local_account_links l WHERE l.user_id=u.id AND l.issuer_id=$2 AND l.organisation_id=$5 AND l.purpose='setup'))
    ORDER BY u.name,u.id LIMIT 100`,
          [actor.environment, actor.id, '%' + search + '%', global, selected],
        )
      ).rows;
      const targets = [];
      for (const target of candidates)
        if (
          (await this.access.active(sql, target.id, actor.environment)) &&
          (global || !(await globalAdmin(sql, target.id, actor.environment)))
        )
          targets.push({
            id: target.id,
            name: target.name,
            email: target.email,
            passwordEnabled: target.password_enabled,
          });
      return {
        links,
        total,
        clients: global ? clients : clients.filter((c) => c.id === selected),
        targets,
        page,
        clientId: selected,
        global,
      };
    });
  }
  async cancel(
    token: string,
    csrf: string,
    id: string,
    client: string | null,
    password: string,
    reason: string,
  ) {
    return this.mutation(token, csrf, client, password, reason, async (sql, actor) => {
      const row = (
        await sql.query<Link>(
          'SELECT * FROM local_account_links WHERE id=$1 AND environment=$2 FOR UPDATE',
          [id, actor.environment],
        )
      ).rows[0];
      const admin = await globalAdmin(sql, actor.id, actor.environment);
      requireCondition(
        row && (row.issuer_id === actor.id || admin) && (row.organisation_id === client || admin),
        403,
        'link_forbidden',
        'You cannot cancel this link.',
      );
      await sql.query(
        'UPDATE local_account_links SET revoked_at=now() WHERE id=$1 AND consumed_at IS NULL',
        [id],
      );
      await this.platform.audit(sql, actor, 'local.link.cancelled', id, reason, {});
      return { cancelled: true };
    });
  }
}
