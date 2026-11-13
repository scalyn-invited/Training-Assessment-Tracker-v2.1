import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Sql } from '../../database/src/database.js';
import type { AuthUser } from './auth.js';
import { requireCondition } from './errors.js';

export function mockIdentityEnabled() {
    return (
      ['development', 'test'].includes(process.env.NODE_ENV ?? 'development') &&
      process.env.TRAINING_AUTH_MODE === 'mock' &&
      process.env.MOCK_IDENTITY_ENABLED === 'true' &&
      process.env.TRAINING_ENVIRONMENT === 'test'
    );
  }

// Local synthetic contract harness only; never a production JWT or OIDC adapter.
export class MockIdentity {
  constructor(
    private readonly key: Buffer,
    private readonly now = () => Math.floor(Date.now() / 1000),
  ) {}
  enabled() { return mockIdentityEnabled(); }
  assertEnabled() {
    requireCondition(
      this.enabled(),
      503,
      'identity_unconfigured',
      'Live identity integration is not configured.',
    );
  }
  private signature(payload: string) {
    return createHmac('sha256', this.key).update(payload).digest('hex');
  }
  async resolve(sql: Sql, issuer: string, subject: string) {
    const user = (
      await sql.query<AuthUser & { origin: string; permissions_synced_at: Date | null }>(
        `SELECT u.* FROM identities i JOIN users u ON u.id=i.user_id
       WHERE i.issuer=$1 AND i.subject=$2 AND i.active AND u.active AND u.is_synthetic AND u.environment='test'`,
        [issuer, subject],
      )
    ).rows[0];
    requireCondition(user, 401, 'invalid_identity', 'The delegated identity is unavailable.');
    return user;
  }
  async issue(sql: Sql, user: AuthUser, overrides: Record<string, unknown> = {}) {
    this.assertEnabled();
    const identity = (
      await sql.query(
        'SELECT issuer,subject FROM identities WHERE user_id=$1 ORDER BY id LIMIT 1',
        [user.id],
      )
    ).rows[0];
    requireCondition(identity, 401, 'invalid_identity', 'The delegated identity is unavailable.');
    const claims = {
      iss: identity.issuer,
      sub: identity.subject,
      aud: process.env.MOCK_IDENTITY_AUDIENCE ?? 'training-sandbox',
      client_id: process.env.MOCK_IDENTITY_CLIENT ?? 'primary-sandbox',
      kind: 'delegated',
      scope: ['training.self.read', 'training.member.read', 'training.group.read', 'jobs.read'],
      iat: this.now(),
      exp: this.now() + 300,
      jti: randomUUID(),
      permission_version: user.permission_version,
      ...overrides,
    };
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return `${payload}.${this.signature(payload)}`;
  }
  async verify(sql: Sql, token: string, scope: string) {
    this.assertEnabled();
    const parts = token.split('.');
    const expected = Buffer.from(this.signature(parts[0] ?? ''));
    const signature = Buffer.from(parts[1] ?? '');
    requireCondition(
      token.length <= 8192 &&
        parts.length === 2 &&
        signature.length === expected.length &&
        timingSafeEqual(signature, expected),
      401,
      'invalid_token',
      'The delegated token is invalid.',
    );
    let claims: Record<string, unknown> | undefined;
    try {
      const value: unknown = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
      if (value && typeof value === 'object' && !Array.isArray(value))
        claims = value as Record<string, unknown>;
    } catch {
      /* Invalid credentials receive a sanitized denial. */
    }
    requireCondition(
      claims &&
        claims.iss ===
          (process.env.MOCK_IDENTITY_ISSUER ?? 'https://identity.example.invalid/mock') &&
        claims.aud === (process.env.MOCK_IDENTITY_AUDIENCE ?? 'training-sandbox') &&
        claims.client_id === (process.env.MOCK_IDENTITY_CLIENT ?? 'primary-sandbox') &&
        claims.kind === 'delegated' &&
        typeof claims.sub === 'string' &&
        Number.isSafeInteger(claims.iat) &&
        Number.isSafeInteger(claims.exp) &&
        Number(claims.exp) > this.now() &&
        Number(claims.iat) <= this.now() &&
        Number(claims.exp) - Number(claims.iat) <= 300,
      401,
      'invalid_token',
      'The delegated token is invalid.',
    );
    requireCondition(
      Array.isArray(claims.scope) && claims.scope.includes(scope),
      403,
      'scope_required',
      'The delegated operation scope is missing.',
    );
    const user = await this.resolve(sql, String(claims.iss), claims.sub as string);
    requireCondition(
      claims.permission_version === user.permission_version,
      401,
      'invalid_token',
      'The delegated token is invalid.',
    );
    requireCondition(
      user.origin !== 'primary_import' ||
        (user.permissions_synced_at &&
          new Date(user.permissions_synced_at).getTime() >= (this.now() - 300) * 1000),
      503,
      'permissions_stale',
      'Permissions are stale.',
    );
    return user;
  }
}
