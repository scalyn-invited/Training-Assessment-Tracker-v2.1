import { beforeAll, afterAll, it, expect, describe } from 'vitest';
import { randomBytes } from 'node:crypto';
import * as OTPAuth from 'otpauth';
import { testDatabase } from './helpers.js';
import { Auth } from '../packages/domain/src/auth.js';
import { digest } from '../packages/domain/src/crypto.js';
describe('fresh setup and optional MFA', () => {
  let instance: Awaited<ReturnType<typeof testDatabase>>, auth: Auth;
  let session: { token: string; csrf: string }, recoveryCodes: string[];
  const password = 'A unique administrator passphrase',
    email = 'admin@example.invalid';
  beforeAll(async () => {
    instance = await testDatabase();
    auth = new Auth(instance.db, randomBytes(32));
    session = (await auth.context()) as typeof session;
  });
  afterAll(async () => {
    await instance?.close();
  });
  it('rejects CSRF and weak passwords without creating accounts', async () => {
    await expect(
      auth.setup(session.token, 'wrong', {
        name: 'Admin',
        email,
        password,
        demoPassword: 'Separate demonstration password',
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      auth.setup(session.token, session.csrf, {
        name: 'Admin',
        email,
        password: 'short',
        demoPassword: 'Separate demonstration password',
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect((await instance.db.pool.query('SELECT * FROM users')).rows).toHaveLength(0);
  });
  it('creates the administrator and 30 fictional accounts once', async () => {
    await auth.setup(session.token, session.csrf, {
      name: 'Admin',
      email,
      password,
      demoPassword: 'Separate demonstration password',
    });
    expect((await instance.db.pool.query('SELECT id FROM users')).rows).toHaveLength(31);
    await expect(
      auth.setup(session.token, session.csrf, {
        name: 'Admin',
        email,
        password,
        demoPassword: 'Separate demonstration password',
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('allows password-only login by default and rotates the guest session', async () => {
    const old = session.token;
    session = await auth.login(session.token, session.csrf, email, password);
    expect(session.token).not.toBe(old);
    expect(
      (
        await instance.db.pool.query('SELECT token_hash FROM sessions WHERE token_hash=$1', [
          digest(old),
        ])
      ).rows,
    ).toHaveLength(0);
    expect((await auth.mfaStatus(session.token)).enabled).toBe(false);
  });
  it('does not expose password hashes in the public context', async () => {
    const context = await auth.context(session.token);
    expect(context.user?.email).toBe(email);
    expect(JSON.stringify(context)).not.toContain('password_hash');
  });
  it('requires password reauthentication for MFA enrollment', async () => {
    await expect(auth.beginMfa(session.token, session.csrf, 'incorrect')).rejects.toMatchObject({
      status: 403,
    });
  });
  it('encrypts enrollment secret and enables MFA only after code confirmation', async () => {
    const result = await auth.beginMfa(session.token, session.csrf, password);
    const stored = JSON.stringify((await instance.db.pool.query('SELECT * FROM user_mfa')).rows);
    expect(stored).not.toContain(result.secret);
    expect((await auth.mfaStatus(session.token)).enabled).toBe(false);
    const code = new OTPAuth.TOTP({ secret: result.secret }).generate();
    recoveryCodes = (await auth.confirmMfa(session.token, session.csrf, code)).recoveryCodes;
    expect(recoveryCodes).toHaveLength(10);
    expect((await auth.mfaStatus(session.token)).enabled).toBe(true);
    expect(
      JSON.stringify((await instance.db.pool.query('SELECT * FROM recovery_codes')).rows),
    ).not.toContain(recoveryCodes[0]);
  });
  it('requires a second factor after enrollment and accepts a recovery code once', async () => {
    const guest = await auth.context();
    await expect(auth.login(guest.token!, guest.csrf, email, password)).rejects.toMatchObject({
      code: 'mfa_required',
    });
    const loggedIn = await auth.login(guest.token!, guest.csrf, email, password, recoveryCodes[0]);
    session = loggedIn;
    const nextGuest = await auth.context();
    await expect(
      auth.login(nextGuest.token!, nextGuest.csrf, email, password, recoveryCodes[0]),
    ).rejects.toMatchObject({ code: 'invalid_code' });
  });
  it('requires both password and a second factor to disable MFA', async () => {
    await expect(
      auth.disableMfa(session.token, session.csrf, 'wrong', recoveryCodes[1]),
    ).rejects.toMatchObject({ status: 403 });
    await auth.disableMfa(session.token, session.csrf, password, recoveryCodes[1]);
    expect((await auth.mfaStatus(session.token)).enabled).toBe(false);
  });
  it('changes a password, rotates the session and revokes old sessions', async () => {
    const old = session.token;
    session = await auth.changePassword(
      session.token,
      session.csrf,
      password,
      'A new unique administrator passphrase',
    );
    expect(session.token).not.toBe(old);
    expect((await auth.context(old)).user).toBeNull();
    expect((await auth.context(session.token)).user?.email).toBe(email);
  });
  it('persists rate limits independently of failed account transactions', async () => {
    await auth.limit('isolated-rate-limit', 2);
    await auth.limit('isolated-rate-limit', 2);
    await expect(auth.limit('isolated-rate-limit', 2)).rejects.toMatchObject({ status: 429 });
  });
  it('revokes sessions when the account is deactivated', async () => {
    await instance.db.pool.query('UPDATE users SET active=false WHERE email=$1', [email]);
    expect((await auth.context(session.token)).user).toBeNull();
  });
});
