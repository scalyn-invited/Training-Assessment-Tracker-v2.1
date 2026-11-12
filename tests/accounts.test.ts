import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { testDatabase } from './helpers.js';
import { Auth } from '../packages/domain/src/auth.js';
import { Tenancy } from '../packages/domain/src/tenancy.js';
import { Accounts } from '../packages/domain/src/accounts.js';
import { digest } from '../packages/domain/src/crypto.js';
describe('administrator issued local account actions', () => {
  let instance: Awaited<ReturnType<typeof testDatabase>>,
    auth: Auth,
    accounts: Accounts,
    admin: { token: string; csrf: string },
    client: string,
    other: string,
    userId: string;
  let setup: Awaited<ReturnType<Accounts['create']>>;
  const adminPassword = 'Unique administrator passphrase',
    memberPassword = 'Recipient password for verification',
    reason = 'Verified account administration';
  async function guest() {
    const result = await auth.context();
    return { token: result.token!, csrf: result.csrf };
  }
  async function login(email: string, password: string) {
    const g = await guest();
    return auth.login(g.token, g.csrf, email, password);
  }
  const create = (email: string, mode: 'new' | 'existing' = 'new', clientId = client) =>
    accounts.create(admin.token, admin.csrf, {
      clientId,
      name: 'New member',
      email,
      password: adminPassword,
      reason,
      mode,
      synthetic: true,
    });
  beforeAll(async () => {
    instance = await testDatabase();
    auth = new Auth(instance.db, randomBytes(32));
    accounts = new Accounts(auth);
    const g = await guest();
    await auth.setup(g.token, g.csrf, {
      name: 'Admin',
      email: 'admin@example.invalid',
      password: adminPassword,
      demoPassword: 'Separate demonstration password',
    });
    admin = await login('admin@example.invalid', adminPassword);
    const clients = (await instance.db.pool.query('SELECT id FROM organisations ORDER BY name'))
      .rows;
    client = clients[0].id;
    other = clients[1].id;
  });
  beforeEach(async () => {
    await instance.db.pool.query('DELETE FROM auth_attempts');
  });
  afterAll(async () => {
    await instance?.close();
  });
  it('requires administrator reauthentication and never grants access on issuance', async () => {
    await expect(
      accounts.create(admin.token, admin.csrf, {
        clientId: client,
        name: 'New',
        email: 'new@example.invalid',
        password: 'wrong',
        reason,
        mode: 'new',
        synthetic: true,
      }),
    ).rejects.toMatchObject({ status: 403 });
    setup = await create('new@example.invalid');
    const user = (
      await instance.db.pool.query(
        "SELECT id,password_enabled FROM users WHERE email='new@example.invalid'",
      )
    ).rows[0];
    userId = user.id;
    expect(user.password_enabled).toBe(false);
    expect(
      (await instance.db.pool.query('SELECT id FROM client_memberships WHERE user_id=$1', [userId]))
        .rows,
    ).toHaveLength(0);
    const stored = JSON.stringify(
      (await instance.db.pool.query('SELECT * FROM local_account_links')).rows,
    );
    expect(stored).not.toContain(setup.token);
    expect(stored).toContain(digest(setup.token));
    expect(setup.path).toContain('#');
  });
  it('sets a password once and grants only the initial Member role', async () => {
    const g = await guest();
    await expect(
      accounts.redeem(g.token, 'wrong', setup.token, 'setup', memberPassword, memberPassword),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      accounts.redeem(g.token, g.csrf, setup.token, 'setup', memberPassword, 'different'),
    ).rejects.toMatchObject({ status: 422 });
    await accounts.redeem(g.token, g.csrf, setup.token, 'setup', memberPassword, memberPassword);
    await expect(
      accounts.redeem(g.token, g.csrf, setup.token, 'setup', memberPassword, memberPassword),
    ).rejects.toMatchObject({ status: 410 });
    const roles = (
      await instance.db.pool.query(
        'SELECT role,scope_type FROM role_assignments WHERE user_id=$1',
        [userId],
      )
    ).rows;
    expect(roles).toEqual([{ role: 'member', scope_type: 'client' }]);
    expect((await login('new@example.invalid', memberPassword)).user?.id).toBe(userId);
  });
  it('requires the exact signed-in invitation recipient', async () => {
    const invitation = await create('new@example.invalid', 'existing', other);
    await expect(
      accounts.redeem(admin.token, admin.csrf, invitation.token, 'invite'),
    ).rejects.toMatchObject({ code: 'wrong_recipient' });
    expect(
      (
        await instance.db.pool.query(
          'SELECT id FROM client_memberships WHERE user_id=$1 AND organisation_id=$2',
          [userId, other],
        )
      ).rows,
    ).toHaveLength(0);
    const recipient = await login('new@example.invalid', memberPassword);
    await accounts.redeem(recipient.token, recipient.csrf, invitation.token, 'invite');
    expect((await auth.context(recipient.token)).user).toBeNull();
    expect(
      (await instance.db.pool.query('SELECT id FROM client_memberships WHERE user_id=$1', [userId]))
        .rows,
    ).toHaveLength(2);
  });
  it('reissues and cancels links without retaining usable older tokens', async () => {
    const first = await accounts.recover(admin.token, admin.csrf, {
      userId,
      clientId: client,
      purpose: 'reset',
      password: adminPassword,
      reason,
    });
    const second = await accounts.recover(admin.token, admin.csrf, {
      userId,
      clientId: client,
      purpose: 'reset',
      password: adminPassword,
      reason,
    });
    const g = await guest();
    await expect(accounts.inspect(g.token, g.csrf, first.token, 'reset')).rejects.toMatchObject({
      status: 410,
    });
    await accounts.cancel(admin.token, admin.csrf, second.id, client, adminPassword, reason);
    await expect(accounts.inspect(g.token, g.csrf, second.token, 'reset')).rejects.toMatchObject({
      status: 410,
    });
  });
  it('password reset revokes sessions but preserves optional MFA configuration', async () => {
    const recipient = await login('new@example.invalid', memberPassword);
    await instance.db.pool.query(
      "INSERT INTO user_mfa(user_id,secret_ciphertext,enabled,last_counter) VALUES($1,'encrypted-placeholder',false,0)",
      [userId],
    );
    const link = await accounts.recover(admin.token, admin.csrf, {
      userId,
      clientId: client,
      purpose: 'reset',
      password: adminPassword,
      reason,
    });
    const g = await guest(),
      next = 'Another recipient password for verification';
    await accounts.redeem(g.token, g.csrf, link.token, 'reset', next, next);
    expect((await auth.context(recipient.token)).user).toBeNull();
    expect(
      (await instance.db.pool.query('SELECT user_id FROM user_mfa WHERE user_id=$1', [userId]))
        .rows,
    ).toHaveLength(1);
    await expect(login('new@example.invalid', memberPassword)).rejects.toMatchObject({
      status: 401,
    });
    expect((await login('new@example.invalid', next)).user?.id).toBe(userId);
  });
  it('rejects expired links and changed issuer authority at redemption', async () => {
    const expired = await create('expired@example.invalid');
    await instance.db.pool.query(
      "UPDATE local_account_links SET expires_at=now()-interval '1 second' WHERE id=$1",
      [expired.id],
    );
    const g = await guest();
    await expect(accounts.inspect(g.token, g.csrf, expired.token, 'setup')).rejects.toMatchObject({
      status: 410,
    });
    const changed = await create('changed@example.invalid');
    await instance.db.pool.query(
      'UPDATE local_account_links SET issuer_version=issuer_version-1 WHERE id=$1',
      [changed.id],
    );
    await expect(
      accounts.redeem(g.token, g.csrf, changed.token, 'setup', memberPassword, memberPassword),
    ).rejects.toMatchObject({ code: 'link_authority_changed' });
    expect(
      (
        await instance.db.pool.query('SELECT consumed_at FROM local_account_links WHERE id=$1', [
          changed.id,
        ])
      ).rows[0].consumed_at,
    ).toBeNull();
  });
  it('a Client Admin cannot reset a Global Admin or issue cross-client access', async () => {
    const local = await login('demo.1.0@example.invalid', 'Separate demonstration password');
    const root = (
      await instance.db.pool.query("SELECT id FROM users WHERE email='admin@example.invalid'")
    ).rows[0].id;
    await expect(
      accounts.recover(local.token, local.csrf, {
        userId: root,
        clientId: client,
        purpose: 'reset',
        password: 'Separate demonstration password',
        reason,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      accounts.create(local.token, local.csrf, {
        clientId: other,
        name: 'No access',
        email: 'denied@example.invalid',
        password: 'Separate demonstration password',
        reason,
        mode: 'new',
        synthetic: true,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('lists only scoped metadata and requires the invitation recipient before inspection', async () => {
    const invitation = await create('demo.2.3@example.invalid', 'existing', client);
    const g = await guest();
    await expect(
      accounts.inspect(g.token, g.csrf, invitation.token, 'invite'),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      accounts.inspect(admin.token, admin.csrf, invitation.token, 'invite'),
    ).rejects.toMatchObject({ code: 'wrong_recipient' });
    const listing = await accounts.manage(admin.token, null);
    expect(JSON.stringify(listing)).not.toContain(invitation.token);
    expect(JSON.stringify(listing)).not.toContain('token_hash');
    expect(JSON.stringify(listing)).not.toContain('password_hash');
    const local = await login('demo.1.0@example.invalid', 'Separate demonstration password');
    await new Tenancy(auth).select(local.token, local.csrf, client);
    const scoped = await accounts.manage(local.token, other);
    expect(scoped.clientId).toBe(client);
    expect(scoped.links).toEqual([]);
    expect(scoped.clients.map((c) => c.id)).toEqual([client]);
  });
});
