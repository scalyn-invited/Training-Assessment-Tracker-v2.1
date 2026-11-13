import { AccountDelivery, type AccountMessage } from '../packages/domain/src/account-delivery.js';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { testDatabase } from './helpers.js';
import { Auth } from '../packages/domain/src/auth.js';
import { Tenancy } from '../packages/domain/src/tenancy.js';
import { Accounts } from '../packages/domain/src/accounts.js';
import { digest } from '../packages/domain/src/crypto.js';
describe('synchronous account-link delivery', () => {
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
      synthetic: false,
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

  it('does not consume or send disabled, unapproved or synthetic recipient links', async () => {
    const link = await create('mail-disabled@example.invalid');
    let calls = 0;
    const mail = {
      configured: () => false,
      send: async () => {
        calls++;
      },
    };
    expect(
      await new AccountDelivery(
        accounts,
        mail,
        () => ['mail-disabled@example.invalid'],
        'https://training.example.invalid',
      ).send(admin.token, admin.csrf, link),
    ).toContain('not sent');
    mail.configured = () => true;
    expect(
      await new AccountDelivery(accounts, mail, () => [], 'https://training.example.invalid').send(
        admin.token,
        admin.csrf,
        link,
      ),
    ).toContain('not sent');
    const synthetic = await accounts.create(admin.token, admin.csrf, {
      clientId: client,
      name: 'Synthetic',
      email: 'synthetic-mail@example.invalid',
      password: adminPassword,
      reason,
      mode: 'new',
      synthetic: true,
    });
    expect(
      await new AccountDelivery(
        accounts,
        mail,
        () => ['synthetic-mail@example.invalid'],
        'https://training.example.invalid',
      ).send(admin.token, admin.csrf, synthetic),
    ).toContain('not sent');
    expect(calls).toBe(0);
    expect(
      (
        await instance.db.pool.query('SELECT consumed_at FROM local_account_links WHERE id=$1', [
          link.id,
        ])
      ).rows[0].consumed_at,
    ).toBeNull();
  });
  it('delivers the exact private fragment synchronously and sanitises uncertain transport results', async () => {
    const link = await create('mail-approved@example.invalid'),
      messages: AccountMessage[] = [];
    const mail = {
      configured: () => true,
      send: async (m: AccountMessage) => {
        messages.push(m);
      },
    };
    const delivery = new AccountDelivery(
      accounts,
      mail,
      () => ['mail-approved@example.invalid'],
      'https://training.example.invalid',
    );
    expect(await delivery.send(admin.token, admin.csrf, link)).toContain(
      'Inbox delivery is not confirmed',
    );
    expect(messages[0].url).toBe('https://training.example.invalid' + link.path);
    expect(messages[0].expiresAt).toEqual(link.expiresAt);
    mail.send = async () => {
      throw new Error('Sensitive failure ' + link.token);
    };
    const failure = await delivery.send(admin.token, admin.csrf, link);
    expect(failure).toContain('could not be confirmed');
    expect(failure).not.toContain(link.token);
    expect(
      (
        await instance.db.pool.query('SELECT consumed_at FROM local_account_links WHERE id=$1', [
          link.id,
        ])
      ).rows[0].consumed_at,
    ).toBeNull();
    expect((await instance.db.pool.query('SELECT id FROM outbox_events')).rowCount).toBe(0);
    const audits = JSON.stringify(
      (await instance.db.pool.query('SELECT * FROM platform_audit_events')).rows,
    );
    expect(audits).toContain('local.email.accepted');
    expect(audits).toContain('local.email.failed');
    expect(audits).not.toContain(link.token);
  });
  it('requires the exact issuer and current unused link', async () => {
    const link = await create('mail-authority@example.invalid'),
      delivery = new AccountDelivery(
        accounts,
        {
          configured: () => true,
          send: async () => {
            throw new Error('Must not send');
          },
        },
        () => ['mail-authority@example.invalid'],
        'https://training.example.invalid',
      );
    const otherActor = await login('demo.1.2@example.invalid', 'Separate demonstration password');
    await expect(delivery.send(otherActor.token, otherActor.csrf, link)).rejects.toMatchObject({
      code: 'link_issuer_required',
    });
    await expect(
      delivery.send(admin.token, admin.csrf, { ...link, id: randomUUID() }),
    ).rejects.toMatchObject({ code: 'link_issuer_required' });
    await accounts.cancel(admin.token, admin.csrf, link.id, client, adminPassword, reason);
    await expect(delivery.send(admin.token, admin.csrf, link)).rejects.toMatchObject({
      status: 410,
    });
  });
  it('rejects unsafe application origins without contacting the transport', async () => {
    const link = await create('mail-origin@example.invalid');
    let calls = 0;
    for (const origin of [
      'not an origin',
      'http://training.example.invalid',
      'https://user:pass@training.example.invalid',
    ]) {
      const delivery = new AccountDelivery(
        accounts,
        {
          configured: () => true,
          send: async () => {
            calls++;
          },
        },
        () => ['mail-origin@example.invalid'],
        origin,
      );
      expect(await delivery.send(admin.token, admin.csrf, link)).toContain(
        'secure application address',
      );
    }
    expect(calls).toBe(0);
  });
});
