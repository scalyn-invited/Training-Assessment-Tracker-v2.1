import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { testDatabase } from './helpers.js';
import { Auth } from '../packages/domain/src/auth.js';
import { Accounts } from '../packages/domain/src/accounts.js';
import { digest } from '../packages/domain/src/crypto.js';

describe('mock browser sign-in', () => {
  let instance: Awaited<ReturnType<typeof testDatabase>>, auth: Auth;
  let identity: { id: string; user_id: string }, realIdentity: string;
  beforeAll(async () => {
    instance = await testDatabase();
    auth = new Auth(instance.db, randomBytes(32));
    const guest = await auth.context();
    await auth.setup(guest.token!, guest.csrf, {
      name: 'Real administrator',
      email: 'admin@example.invalid',
      password: 'Private administrator passphrase',
      demoPassword: 'Separate synthetic passphrase',
    });
    identity = (
      await instance.db.pool.query(
        "SELECT i.id,i.user_id FROM identities i JOIN users u ON u.id=i.user_id WHERE u.email='demo.1.3@example.invalid'",
      )
    ).rows[0];
    realIdentity = (
      await instance.db.pool.query(
        'SELECT i.id FROM identities i JOIN users u ON u.id=i.user_id WHERE NOT u.is_synthetic',
      )
    ).rows[0].id;
  });
  afterAll(async () => {
    await instance?.close();
  });
  beforeEach(async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('TRAINING_AUTH_MODE', 'mock');
    vi.stubEnv('MOCK_IDENTITY_ENABLED', 'true');
    vi.stubEnv('TRAINING_ENVIRONMENT', 'test');
    await instance.db.pool.query('DELETE FROM auth_attempts');
    await instance.db.pool.query(
      "UPDATE users SET active=true,origin='manual',environment='test',permissions_synced_at=now() WHERE id=$1",
      [identity.user_id],
    );
    await instance.db.pool.query('UPDATE identities SET active=true WHERE id=$1', [identity.id]);
  });
  afterEach(() => vi.unstubAllEnvs());
  const login = async () => {
    const guest = await auth.context();
    return auth.mockLogin(guest.token!, guest.csrf, identity.id);
  };
  it('lists only available synthetic identities with minimal public fields', async () => {
    const options = await auth.signInOptions();
    expect(options.mode).toBe('mock');
    expect(options.identities).toHaveLength(30);
    expect(options.identities.some((i) => i.id === realIdentity)).toBe(false);
    expect(Object.keys(options.identities[0]).sort()).toEqual(['id', 'name']);
    await instance.db.pool.query('UPDATE identities SET active=false WHERE id=$1', [identity.id]);
    expect((await auth.signInOptions()).identities.some((i) => i.id === identity.id)).toBe(false);
  });
  it('requires CSRF, rotates the guest, pins identity and selects the sole client', async () => {
    const guest = await auth.context();
    await expect(auth.mockLogin(guest.token!, 'wrong', identity.id)).rejects.toMatchObject({
      status: 403,
    });
    const session = await auth.mockLogin(guest.token!, guest.csrf, identity.id);
    expect(session.token).not.toBe(guest.token);
    expect(session.csrf).not.toBe(guest.csrf);
    expect(
      (
        await instance.db.pool.query('SELECT token_hash FROM sessions WHERE token_hash=$1', [
          digest(guest.token!),
        ])
      ).rowCount,
    ).toBe(0);
    const stored = (
      await instance.db.pool.query('SELECT * FROM sessions WHERE token_hash=$1', [
        digest(session.token),
      ])
    ).rows[0];
    expect(stored).toMatchObject({ authentication_mode: 'mock', identity_id: identity.id });
    expect(stored.organisation_id).toBeTruthy();
    const context = await auth.context(session.token);
    expect(context.user?.id).toBe(identity.user_id);
    expect(JSON.stringify(context)).not.toMatch(/password_hash|identity_id|permissions_synced_at/);
    await expect(
      instance.db.pool.query('UPDATE sessions SET identity_id=$1 WHERE token_hash=$2', [
        realIdentity,
        digest(session.token),
      ]),
    ).rejects.toThrow();
    expect(
      (
        await instance.db.pool.query(
          "SELECT id FROM account_audit WHERE user_id=$1 AND action='mock.login'",
          [identity.user_id],
        )
      ).rowCount,
    ).toBeGreaterThan(0);
  });
  it('rejects real identities and disabled or production harnesses', async () => {
    const guest = await auth.context();
    await expect(auth.mockLogin(guest.token!, guest.csrf, realIdentity)).rejects.toMatchObject({
      status: 401,
    });
    await expect(
      auth.login(
        guest.token!,
        guest.csrf,
        'admin@example.invalid',
        'Private administrator passphrase',
      ),
    ).rejects.toMatchObject({ status: 503 });
    for (const [key, value] of [
      ['NODE_ENV', 'production'],
      ['TRAINING_ENVIRONMENT', 'production'],
      ['MOCK_IDENTITY_ENABLED', 'false'],
    ]) {
      const prior = process.env[key];
      vi.stubEnv(key, value);
      expect((await auth.signInOptions()).mode).toBe('unavailable');
      await expect(auth.mockLogin(guest.token!, guest.csrf, identity.id)).rejects.toMatchObject({
        status: 503,
      });
      vi.stubEnv(key, prior);
    }
    vi.stubEnv('TRAINING_AUTH_MODE', 'local_password');
    expect(await auth.signInOptions()).toEqual({ mode: 'local_password', identities: [] });
  });
  it('invalidates sessions after identity, permission, idle, absolute expiry or mode changes', async () => {
    for (const mutation of [
      () => instance.db.pool.query('UPDATE identities SET active=false WHERE id=$1', [identity.id]),
      () =>
        instance.db.pool.query(
          'UPDATE users SET permission_version=permission_version+1 WHERE id=$1',
          [identity.user_id],
        ),
      () =>
        instance.db.pool.query(
          "UPDATE sessions SET last_seen_at=now()-interval '31 minutes' WHERE user_id=$1",
          [identity.user_id],
        ),
      () =>
        instance.db.pool.query(
          "UPDATE sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1",
          [identity.user_id],
        ),
      async () => {
        vi.stubEnv('TRAINING_AUTH_MODE', 'local_password');
      },
    ]) {
      await instance.db.pool.query('DELETE FROM auth_attempts');
      await instance.db.pool.query('UPDATE identities SET active=true WHERE id=$1', [identity.id]);
      vi.stubEnv('TRAINING_AUTH_MODE', 'mock');
      const session = await login();
      await mutation();
      expect((await auth.context(session.token)).user).toBeNull();
    }
  });
  it('fails closed on stale permissions without discarding the valid identity session', async () => {
    const session = await login();
    await instance.db.pool.query(
      "UPDATE users SET origin='primary_import',permissions_synced_at=now()-interval '6 minutes' WHERE id=$1",
      [identity.user_id],
    );
    await expect(auth.context(session.token)).rejects.toMatchObject({
      status: 503,
      code: 'permissions_stale',
    });
    await expect(
      instance.db.transaction((sql) => auth.verified(sql, session.token, session.csrf)),
    ).rejects.toMatchObject({ status: 503 });
    expect((await auth.signInOptions()).identities.some((i) => i.id === identity.id)).toBe(false);
    await instance.db.pool.query('UPDATE users SET permissions_synced_at=now() WHERE id=$1', [
      identity.user_id,
    ]);
    expect((await auth.context(session.token)).user?.id).toBe(identity.user_id);
  });
  it('blocks local password, MFA and local account links in mock mode', async () => {
    const session = await login();
    for (const action of [
      () => auth.mfaStatus(session.token),
      () => auth.beginMfa(session.token, session.csrf, 'Separate synthetic passphrase'),
      () => auth.confirmMfa(session.token, session.csrf, '123456'),
      () => auth.disableMfa(session.token, session.csrf, 'Separate synthetic passphrase', '123456'),
      () =>
        auth.changePassword(
          session.token,
          session.csrf,
          'Separate synthetic passphrase',
          'Replacement private password',
          'Replacement private password',
        ),
      () => new Accounts(auth).manage(session.token, null),
      () => new Accounts(auth).inspect(session.token, session.csrf, 'invalid', 'reset'),
    ])
      await expect(action()).rejects.toMatchObject({
        status: 503,
        code: 'local_password_unavailable',
      });
  });
});
