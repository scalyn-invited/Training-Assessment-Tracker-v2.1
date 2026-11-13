import { MockIdentity } from './mock-identity.js';
import { Access, globalAdmin } from './access.js';
import { seedTenancy } from './seed-tenancy.js';
import { randomUUID, randomBytes } from 'node:crypto';
import * as OTPAuth from 'otpauth';
import type { Database, Sql } from '../../database/src/database.js';
import { requireCondition, DomainError } from './errors.js';
import { digest, secret, passwordHash, passwordMatches, encrypt, decrypt } from './crypto.js';
export type AuthUser = {
  id: string;
  name: string;
  email: string;
  global_admin: boolean;
  permission_version: number;
  environment: 'test' | 'production';
};
type StoredUser = AuthUser & {
  password_hash: string;
  active: boolean;
  is_synthetic: boolean;
  password_enabled: boolean;
  origin: string;
  permissions_synced_at: Date | null;
};
function eligible(user: StoredUser | undefined | null) {
  return Boolean(
    user?.active &&
    user.password_enabled &&
    user.environment === (process.env.NODE_ENV === 'production' ? 'production' : 'test') &&
    !(user.environment === 'production' && user.is_synthetic),
  );
}
type Session = {
  organisation_id: string | null;
  token_hash: string;
  user_id: string | null;
  csrf: string;
  permission_version: number | null;
  authentication_mode: 'local_password' | 'mock';
  identity_id: string | null;
};
export class Auth {
  constructor(
    readonly db: Database,
    private readonly key: Buffer,
  ) {}
  async audit(sql: Sql, userId: string | null, action: string) {
    await sql.query('INSERT INTO account_audit(id,user_id,action) VALUES($1,$2,$3)', [
      randomUUID(),
      userId,
      action,
    ]);
  }
  async limit(key: string, max = 5) {
    const count = await this.db.transaction(async (sql) => {
      const r = await sql.query<{ count: number }>(
        `INSERT INTO auth_attempts(key_hash,count,reset_at) VALUES($1,1,now()+interval '1 minute')
   ON CONFLICT(key_hash) DO UPDATE SET count=CASE WHEN auth_attempts.reset_at<now() THEN 1 ELSE auth_attempts.count+1 END,
   reset_at=CASE WHEN auth_attempts.reset_at<now() THEN now()+interval '1 minute' ELSE auth_attempts.reset_at END RETURNING count`,
        [digest(key)],
      );
      return r.rows[0].count;
    });
    requireCondition(count <= max, 429, 'rate_limited', 'Wait one minute before trying again.');
  }
  async newSession(sql: Sql, user: AuthUser | null, identityId: string | null = null) {
    const token = secret(),
      csrf = secret();
    await sql.query(
      'INSERT INTO sessions(token_hash,user_id,csrf,permission_version,authentication_mode,identity_id) VALUES($1,$2,$3,$4,$5,$6)',
      [
        digest(token),
        user?.id ?? null,
        csrf,
        user?.permission_version ?? null,
        identityId ? 'mock' : 'local_password',
        identityId,
      ],
    );
    return { token, csrf, user };
  }
  private async sessionEligible(sql: Sql, session: Session, user: StoredUser) {
    if (user.permission_version !== session.permission_version) return false;
    if (session.authentication_mode === 'mock') {
      const valid =
        new MockIdentity(this.key).enabled() &&
        user.active &&
        user.is_synthetic &&
        user.environment === 'test' &&
        Boolean(
          (
            await sql.query('SELECT id FROM identities WHERE id=$1 AND user_id=$2 AND active', [
              session.identity_id,
              user.id,
            ])
          ).rowCount,
        );
      if (!valid) return false;
      requireCondition(
        user.origin !== 'primary_import' ||
          (user.permissions_synced_at &&
            new Date(user.permissions_synced_at).getTime() >= Date.now() - 300000),
        503,
        'permissions_stale',
        'Permissions are stale. Refresh directory access.',
      );
      return true;
    }
    return (
      (process.env.TRAINING_AUTH_MODE ?? 'local_password') === 'local_password' &&
      eligible(user) &&
      (await new Access().active(sql, user.id, user.environment)) &&
      Boolean(
        (
          await sql.query(
            "SELECT id FROM identities WHERE user_id=$1::uuid AND issuer='urn:training:local' AND subject=$1::text AND active",
            [user.id],
          )
        ).rowCount,
      )
    );
  }
  async signInOptions(): Promise<{
    mode: 'local_password' | 'mock' | 'unavailable';
    identities: { id: string; name: string }[];
  }> {
    if ((process.env.TRAINING_AUTH_MODE ?? 'local_password') === 'local_password')
      return { mode: 'local_password', identities: [] };
    const mock = new MockIdentity(this.key);
    if (!mock.enabled()) return { mode: 'unavailable', identities: [] };
    return this.db.transaction(async (sql) => {
      const candidates = (
        await sql.query<{ id: string; user_id: string; name: string }>(
          "SELECT i.id,i.user_id,u.name FROM identities i JOIN users u ON u.id=i.user_id WHERE i.active AND u.active AND u.is_synthetic AND u.environment='test' ORDER BY u.name,i.id",
        )
      ).rows;
      const identities: { id: string; name: string }[] = [];
      for (const candidate of candidates)
        if (await new Access().active(sql, candidate.user_id, 'test'))
          identities.push({ id: candidate.id, name: candidate.name });
      return { mode: 'mock', identities };
    });
  }
  async mockLogin(token: string, csrf: string, identityId: string) {
    const mock = new MockIdentity(this.key);
    mock.assertEnabled();
    requireCondition(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identityId),
      422,
      'identity_required',
      'Choose an available test identity.',
    );
    await this.limit('mock-login:' + identityId);
    return this.db.transaction(async (sql) => {
      await this.verified(sql, token, csrf, false);
      const identity = (
        await sql.query<{ id: string; issuer: string; subject: string; user_id: string }>(
          'SELECT * FROM identities WHERE id=$1 AND active',
          [identityId],
        )
      ).rows[0];
      requireCondition(
        identity,
        401,
        'invalid_identity',
        'This test identity is no longer available.',
      );
      await sql.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [identity.user_id]);
      const user = await mock.resolve(sql, identity.issuer, identity.subject);
      requireCondition(
        await new Access().active(sql, user.id, 'test'),
        503,
        'permissions_stale',
        'Permissions are stale. Refresh directory access.',
      );
      const safe: AuthUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        environment: user.environment,
        permission_version: user.permission_version,
        global_admin: await globalAdmin(sql, user.id, user.environment),
      };
      await sql.query('DELETE FROM sessions WHERE token_hash=$1', [digest(token)]);
      await this.audit(sql, user.id, 'mock.login');
      const session = await this.newSession(sql, safe, identity.id);
      if (!safe.global_admin) {
        const clients = (
          await sql.query(
            "SELECT cm.organisation_id FROM client_memberships cm JOIN organisations o ON o.id=cm.organisation_id JOIN platform_client_states s ON s.organisation_id=o.id AND s.environment=cm.environment WHERE cm.user_id=$1 AND cm.environment='test' AND cm.status='active' AND cm.joined_at<=now() AND cm.ended_at IS NULL AND o.active AND NOT s.suspended",
            [safe.id],
          )
        ).rows;
        if (clients.length === 1)
          await sql.query('UPDATE sessions SET organisation_id=$1 WHERE token_hash=$2', [
            clients[0].organisation_id,
            digest(session.token),
          ]);
      }
      return session;
    });
  }
  async context(token?: string) {
    return this.db.transaction(async (sql) => {
      const installed = Boolean((await sql.query('SELECT singleton FROM installation')).rowCount);
      let session: Session | undefined;
      if (token)
        session = (
          await sql.query<Session>(
            `SELECT * FROM sessions WHERE token_hash=$1 AND expires_at>now() AND last_seen_at>now()-interval '30 minutes' FOR UPDATE`,
            [digest(token)],
          )
        ).rows[0];
      let user: AuthUser | null = null;
      if (session?.user_id) {
        const found = (
          await sql.query<StoredUser>('SELECT * FROM users WHERE id=$1', [session.user_id])
        ).rows[0];
        if (found && (await this.sessionEligible(sql, session, found))) {
          user = {
            id: found.id,
            name: found.name,
            email: found.email,
            global_admin: await globalAdmin(sql, found.id, found.environment),
            permission_version: found.permission_version,
            environment: found.environment,
          };
        } else {
          await sql.query('DELETE FROM sessions WHERE token_hash=$1', [session.token_hash]);
          session = undefined;
        }
      }
      if (!session) return { ...(await this.newSession(sql, null)), installed };
      await sql.query('UPDATE sessions SET last_seen_at=now() WHERE token_hash=$1', [
        session.token_hash,
      ]);
      let client: { id: string; name: string } | null = null;
      if (user && session.organisation_id) {
        const access = new Access();
        if (
          (await access.available(sql, session.organisation_id, user.environment)) &&
          (user.global_admin ||
            (await access.membership(sql, user.id, session.organisation_id, user.environment)))
        ) {
          client = (
            await sql.query<{ id: string; name: string }>(
              'SELECT id,name FROM organisations WHERE id=$1',
              [session.organisation_id],
            )
          ).rows[0];
        } else
          await sql.query('UPDATE sessions SET organisation_id=NULL WHERE token_hash=$1', [
            session.token_hash,
          ]);
      }
      const canAdmin = Boolean(
        user &&
        (user.global_admin ||
          (session.organisation_id &&
            (await new Access().administer(sql, user, session.organisation_id)))),
      );
      const canCoordinate = Boolean(
        user &&
        client &&
        (await new Access().membership(sql, user.id, client.id, user.environment)) &&
        (
          await sql.query(
            "SELECT r.id FROM role_assignments r WHERE r.user_id=$1 AND r.organisation_id=$2 AND r.environment=$3 AND r.role='coordinator' AND r.starts_at<=now() AND (r.ends_at IS NULL OR r.ends_at>now()) AND (r.scope_type='client' OR EXISTS(SELECT 1 FROM groups g WHERE g.id=r.group_id AND g.active AND g.kind='team' AND g.organisation_id=r.organisation_id AND g.environment=r.environment))",
            [user.id, client.id, user.environment],
          )
        ).rowCount,
      );
      return {
        token,
        csrf: session.csrf,
        user,
        installed,
        client,
        canAdmin,
        canCoordinate,
        authMode: session.authentication_mode,
      };
    });
  }
  async verified(
    sql: Sql,
    token: string,
    csrf?: string,
    requireUser = true,
  ): Promise<{ session: Session; user: StoredUser | null }> {
    const session = (
      await sql.query<Session>(
        "SELECT * FROM sessions WHERE token_hash=$1 AND expires_at>now() AND last_seen_at>now()-interval '30 minutes' FOR UPDATE",
        [digest(token)],
      )
    ).rows[0];
    requireCondition(session, 401, 'session_expired', 'Your session has expired. Sign in again.');
    if (csrf !== undefined)
      requireCondition(
        csrf === session.csrf,
        403,
        'csrf_failed',
        'Reload the page before trying again.',
      );
    let user: StoredUser | null = null;
    if (session.user_id) {
      user = (
        await sql.query<StoredUser>('SELECT * FROM users WHERE id=$1 FOR UPDATE', [session.user_id])
      ).rows[0];
      requireCondition(
        user && (await this.sessionEligible(sql, session, user)),
        401,
        'access_revoked',
        'Access has changed. Sign in again.',
      );
    }
    requireCondition(!requireUser || user, 401, 'sign_in_required', 'Sign in to continue.');
    if (user) user.global_admin = await globalAdmin(sql, user.id, user.environment);
    return { session, user };
  }
  async setup(
    token: string,
    csrf: string,
    data: { name: string; email: string; password: string; demoPassword: string },
  ) {
    requireCondition(
      process.env.NODE_ENV !== 'production',
      503,
      'hosted_setup_pending',
      'Prepare hosted installation from the server console and use the private setup wizard.',
    );
    requireCondition(
      data.name.trim().length > 0 &&
        data.name.length <= 120 &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) &&
        data.email.length <= 200,
      422,
      'invalid_profile',
      'Enter your name and a valid email address.',
    );
    requireCondition(
      data.password !== data.demoPassword,
      422,
      'separate_passwords',
      'Choose a separate password for fictional demo accounts.',
    );
    const hash = await passwordHash(data.password),
      demoHash = await passwordHash(data.demoPassword);
    return this.db.transaction(async (sql) => {
      await sql.query('SELECT pg_advisory_xact_lock(21002)');
      await this.verified(sql, token, csrf, false);
      requireCondition(
        !(await sql.query('SELECT singleton FROM installation')).rowCount,
        409,
        'already_installed',
        'This application is already installed. Sign in.',
      );
      requireCondition(
        !(await sql.query('SELECT id FROM users')).rowCount,
        409,
        'nonempty_database',
        'Setup requires an empty account database. Existing accounts were preserved.',
      );
      const adminId = randomUUID();
      await sql.query(
        "INSERT INTO users(id,email,name,password_hash,environment,is_synthetic,global_admin) VALUES($1,$2,$3,$4,'test',false,true)",
        [adminId, data.email.trim().toLowerCase(), data.name.trim(), hash],
      );
      await sql.query(
        "INSERT INTO identities(id,user_id,issuer,subject) VALUES($1,$2::uuid,'urn:training:local',$2::text)",
        [randomUUID(), adminId],
      );
      for (let client = 1; client <= 3; client++) {
        const orgId = randomUUID();
        await sql.query('INSERT INTO organisations(id,name) VALUES($1,$2)', [
          orgId,
          'Demo Client ' + client,
        ]);
        for (let person = 0; person < 10; person++) {
          const id = randomUUID(),
            role = person === 0 ? 'Client Admin' : person <= 2 ? 'Coordinator' : 'Member';
          await sql.query(
            "INSERT INTO users(id,email,name,password_hash,environment) VALUES($1,$2,$3,$4,'test')",
            [
              id,
              'demo.' + client + '.' + person + '@example.invalid',
              'Demo ' + role + ' ' + client + '.' + person,
              demoHash,
            ],
          );
          await sql.query(
            "INSERT INTO identities(id,user_id,issuer,subject) VALUES($1,$2::uuid,'urn:training:local',$2::text)",
            [randomUUID(), id],
          );
          await sql.query(
            "INSERT INTO client_memberships(id,organisation_id,environment,user_id) VALUES($1,$2,'test',$3)",
            [randomUUID(), orgId, id],
          );
        }
      }
      await seedTenancy(sql, adminId);
      await sql.query('INSERT INTO installation(admin_id) VALUES($1)', [adminId]);
      await this.audit(sql, adminId, 'installation.completed');
      return { installed: true };
    });
  }
  async login(token: string, csrf: string, email: string, password: string, code?: string) {
    requireCondition(
      (process.env.TRAINING_AUTH_MODE ?? 'local_password') === 'local_password',
      503,
      'password_signin_unavailable',
      'Password sign-in is unavailable in this authentication mode.',
    );
    await this.limit('login:' + email.trim().toLowerCase());
    return this.db.transaction(async (sql) => {
      await this.verified(sql, token, csrf, false);
      const user = (
        await sql.query<StoredUser>('SELECT * FROM users WHERE email=$1 FOR UPDATE', [
          email.trim().toLowerCase(),
        ])
      ).rows[0];
      // Hash an unknown-account attempt too; do not reveal account existence.
      const dummy = 'scrypt:00000000000000000000000000000000:' + '0'.repeat(128);
      const valid = await passwordMatches(password, user?.password_hash ?? dummy);
      const identity =
        user &&
        (
          await sql.query(
            "SELECT id FROM identities WHERE user_id=$1::uuid AND issuer='urn:training:local' AND subject=$1::text AND active=true",
            [user.id],
          )
        ).rowCount;
      requireCondition(
        eligible(user) &&
          identity &&
          valid &&
          (await new Access().active(sql, user.id, user.environment)),
        401,
        'invalid_credentials',
        'Email or password could not be confirmed.',
      );
      const mfa = (
        await sql.query<{ enabled: boolean }>('SELECT enabled FROM user_mfa WHERE user_id=$1', [
          user.id,
        ])
      ).rows[0];
      if (mfa?.enabled) {
        if (!code)
          throw new DomainError(
            401,
            'mfa_required',
            'Enter your authenticator code or a recovery code.',
          );
        await this.verifyCode(sql, user.id, code);
      }
      await sql.query('DELETE FROM sessions WHERE token_hash=$1', [digest(token)]);
      const safe: AuthUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        global_admin: await globalAdmin(sql, user.id, user.environment),
        permission_version: user.permission_version,
        environment: user.environment,
      };
      await this.audit(sql, user.id, 'login');
      return this.newSession(sql, safe);
    });
  }
  async logout(token: string, csrf: string) {
    return this.db.transaction(async (sql) => {
      const { user } = await this.verified(sql, token, csrf, false);
      await sql.query('DELETE FROM sessions WHERE token_hash=$1', [digest(token)]);
      if (user) await this.audit(sql, user.id, 'logout');
      return this.newSession(sql, null);
    });
  }
  assertLocalPassword() {
    requireCondition(
      (process.env.TRAINING_AUTH_MODE ?? 'local_password') === 'local_password',
      503,
      'local_password_unavailable',
      'Password and authenticator settings are unavailable in this sign-in mode.',
    );
  }
  async mfaStatus(token: string) {
    this.assertLocalPassword();
    return this.db.transaction(async (sql) => {
      const { user } = await this.verified(sql, token);
      return {
        enabled: Boolean(
          (
            await sql.query<{ enabled: boolean }>('SELECT enabled FROM user_mfa WHERE user_id=$1', [
              user!.id,
            ])
          ).rows[0]?.enabled,
        ),
      };
    });
  }
  async beginMfa(token: string, csrf: string, password: string) {
    this.assertLocalPassword();
    await this.limit('mfa:' + digest(token));
    return this.db.transaction(async (sql) => {
      const { user } = await this.verified(sql, token, csrf);
      requireCondition(
        await passwordMatches(password, user!.password_hash),
        403,
        'password_mismatch',
        'Your current password could not be confirmed.',
      );
      const old = (
        await sql.query<{ enabled: boolean }>('SELECT enabled FROM user_mfa WHERE user_id=$1', [
          user!.id,
        ])
      ).rows[0];
      requireCondition(
        !old?.enabled,
        409,
        'mfa_enabled',
        'Authenticator verification is already enabled.',
      );
      const totp = new OTPAuth.TOTP({
        issuer: 'Training Tracker',
        label: user!.email,
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: new OTPAuth.Secret({ size: 20 }),
      });
      await sql.query(
        `INSERT INTO user_mfa(user_id,pending_ciphertext,pending_expires_at) VALUES($1,$2,now()+interval '10 minutes')
   ON CONFLICT(user_id) DO UPDATE SET pending_ciphertext=EXCLUDED.pending_ciphertext,pending_expires_at=EXCLUDED.pending_expires_at`,
        [user!.id, encrypt(totp.secret.base32, this.key)],
      );
      return { secret: totp.secret.base32, uri: totp.toString() };
    });
  }
  async confirmMfa(token: string, csrf: string, code: string) {
    this.assertLocalPassword();
    await this.limit('mfa:' + digest(token));
    return this.db.transaction(async (sql) => {
      const { user } = await this.verified(sql, token, csrf);
      const mfa = (
        await sql.query<{ pending_ciphertext: string }>(
          `SELECT pending_ciphertext FROM user_mfa WHERE user_id=$1 AND NOT enabled AND pending_expires_at>now() FOR UPDATE`,
          [user!.id],
        )
      ).rows[0];
      requireCondition(
        mfa?.pending_ciphertext,
        409,
        'mfa_setup_expired',
        'Start authenticator setup again.',
      );
      const totp = new OTPAuth.TOTP({ secret: decrypt(mfa.pending_ciphertext, this.key) }),
        delta = totp.validate({ token: code, window: 1 });
      requireCondition(
        delta !== null,
        422,
        'invalid_code',
        'Check the authenticator code and try again.',
      );
      await sql.query(
        'UPDATE user_mfa SET secret_ciphertext=pending_ciphertext,pending_ciphertext=NULL,pending_expires_at=NULL,enabled=true,last_counter=$2 WHERE user_id=$1',
        [user!.id, Math.floor(Date.now() / 30000) + delta],
      );
      const recoveryCodes = Array.from({ length: 10 }, () => randomBytes(10).toString('hex'));
      await sql.query('DELETE FROM recovery_codes WHERE user_id=$1', [user!.id]);
      for (const value of recoveryCodes)
        await sql.query('INSERT INTO recovery_codes(user_id,code_hash) VALUES($1,$2)', [
          user!.id,
          digest(value),
        ]);
      await sql.query('DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2', [
        user!.id,
        digest(token),
      ]);
      await this.audit(sql, user!.id, 'mfa.enabled');
      return { enabled: true, recoveryCodes };
    });
  }
  private async verifyCode(sql: Sql, userId: string, code: string) {
    const mfa = (
      await sql.query<{ secret_ciphertext: string; last_counter: string }>(
        'SELECT * FROM user_mfa WHERE user_id=$1 AND enabled=true FOR UPDATE',
        [userId],
      )
    ).rows[0];
    requireCondition(mfa, 409, 'mfa_not_enabled', 'Authenticator verification is not enabled.');
    const recovery = await sql.query(
      'UPDATE recovery_codes SET consumed_at=now() WHERE user_id=$1 AND code_hash=$2 AND consumed_at IS NULL RETURNING code_hash',
      [userId, digest(code.trim())],
    );
    if (recovery.rowCount) return;
    const totp = new OTPAuth.TOTP({ secret: decrypt(mfa.secret_ciphertext, this.key) }),
      delta = totp.validate({ token: code, window: 1 });
    const counter = Math.floor(Date.now() / 30000) + (delta ?? 0);
    requireCondition(
      delta !== null && counter > Number(mfa.last_counter),
      422,
      'invalid_code',
      'Use a new authenticator code or an unused recovery code.',
    );
    await sql.query('UPDATE user_mfa SET last_counter=$2 WHERE user_id=$1', [userId, counter]);
  }
  async disableMfa(token: string, csrf: string, password: string, code: string) {
    this.assertLocalPassword();
    await this.limit('mfa:' + digest(token));
    return this.db.transaction(async (sql) => {
      const { user } = await this.verified(sql, token, csrf);
      requireCondition(
        await passwordMatches(password, user!.password_hash),
        403,
        'password_mismatch',
        'Your current password could not be confirmed.',
      );
      await this.verifyCode(sql, user!.id, code);
      await sql.query('DELETE FROM user_mfa WHERE user_id=$1', [user!.id]);
      await sql.query('DELETE FROM recovery_codes WHERE user_id=$1', [user!.id]);
      await sql.query('DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2', [
        user!.id,
        digest(token),
      ]);
      await this.audit(sql, user!.id, 'mfa.disabled');
      return { enabled: false };
    });
  }
  async changePassword(
    token: string,
    csrf: string,
    current: string,
    next: string,
    confirmation: string,
  ) {
    this.assertLocalPassword();
    requireCondition(
      next === confirmation,
      422,
      'password_confirmation',
      'The passwords must match.',
    );
    await this.limit('password:' + digest(token));
    const hash = await passwordHash(next);
    return this.db.transaction(async (sql) => {
      const { user } = await this.verified(sql, token, csrf);
      requireCondition(
        await passwordMatches(current, user!.password_hash),
        403,
        'password_mismatch',
        'Your current password could not be confirmed.',
      );
      await sql.query(
        'UPDATE users SET password_hash=$2,permission_version=permission_version+1 WHERE id=$1',
        [user!.id, hash],
      );
      await sql.query('DELETE FROM sessions WHERE user_id=$1', [user!.id]);
      await sql.query(
        "UPDATE local_account_links SET revoked_at=now() WHERE user_id=$1 AND purpose IN ('setup','reset') AND consumed_at IS NULL",
        [user!.id],
      );
      await this.audit(sql, user!.id, 'password.changed');
      return this.newSession(sql, null);
    });
  }
}
