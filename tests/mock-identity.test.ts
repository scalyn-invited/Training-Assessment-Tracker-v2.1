import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { MockIdentity } from '../packages/domain/src/mock-identity.js';
import type { Sql } from '../packages/database/src/database.js';

describe('synthetic delegated identity contract', () => {
  const now = 1800000000;
  const issuer = 'https://identity.example.invalid/mock';
  let identity: MockIdentity;
  const user = {
    id: 'user',
    name: 'Synthetic',
    email: 'synthetic@example.invalid',
    global_admin: false,
    permission_version: 4,
    environment: 'test' as const,
    origin: 'manual',
    permissions_synced_at: new Date(now * 1000),
  };
  let exists = true;
  const sql = {
    query: vi.fn(async (query: string) => ({
      rows: query.startsWith('SELECT issuer')
        ? [{ issuer, subject: 'subject' }]
        : exists
          ? [user]
          : [],
      rowCount: exists ? 1 : 0,
    })),
  } as unknown as Sql;
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('TRAINING_AUTH_MODE', 'mock');
    vi.stubEnv('MOCK_IDENTITY_ENABLED', 'true');
    vi.stubEnv('TRAINING_ENVIRONMENT', 'test');
    exists = true;
    user.origin = 'manual';
    user.permissions_synced_at = new Date(now * 1000);
    identity = new MockIdentity(randomBytes(32), () => now);
  });
  afterEach(() => vi.unstubAllEnvs());
  const issue = (overrides = {}) => identity.issue(sql, user, overrides);
  it('accepts exact delegated claims and denies disabled or production harnesses', async () => {
    const token = await issue();
    expect((await identity.verify(sql, token, 'training.self.read')).id).toBe(user.id);
    for (const [key, value] of [
      ['NODE_ENV', 'production'],
      ['TRAINING_AUTH_MODE', 'local'],
      ['MOCK_IDENTITY_ENABLED', 'false'],
      ['TRAINING_ENVIRONMENT', 'production'],
    ]) {
      const previous = process.env[key];
      vi.stubEnv(key, value);
      await expect(identity.verify(sql, token, 'training.self.read')).rejects.toMatchObject({
        status: 503,
      });
      vi.stubEnv(key, previous);
    }
  });
  it('rejects tampering, malformed signatures, oversize credentials and unsafe claim combinations', async () => {
    const token = await issue();
    for (const invalid of [token + 'x', 'x.y', token + '.extra', 'x'.repeat(8193)])
      await expect(identity.verify(sql, invalid, 'training.self.read')).rejects.toMatchObject({
        status: 401,
      });
    for (const overrides of [
      { iss: 'other' },
      { aud: 'other' },
      { client_id: 'other' },
      { kind: 'machine' },
      { exp: now },
      { iat: now + 1 },
      { iat: now - 1, exp: now + 300 },
      { exp: String(now + 300) },
      { iat: null },
      { sub: null },
      { permission_version: 3 },
    ])
      await expect(
        identity.verify(sql, await issue(overrides), 'training.self.read'),
      ).rejects.toMatchObject({ status: 401 });
  });
  it('keeps missing scopes, revoked identity and stale permissions distinct', async () => {
    await expect(
      identity.verify(sql, await issue(), 'training.changes.read'),
    ).rejects.toMatchObject({ status: 403 });
    const token = await issue({ scope: ['training.changes.read'] });
    exists = false;
    await expect(identity.verify(sql, token, 'training.changes.read')).rejects.toMatchObject({
      status: 401,
    });
    exists = true;
    user.origin = 'primary_import';
    user.permissions_synced_at = new Date((now - 301) * 1000);
    await expect(identity.verify(sql, token, 'training.changes.read')).rejects.toMatchObject({
      status: 503,
    });
    user.permissions_synced_at = new Date((now - 299) * 1000);
    await expect(identity.verify(sql, token, 'training.changes.read')).resolves.toMatchObject({
      id: user.id,
    });
  });
});
