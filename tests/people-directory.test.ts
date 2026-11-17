import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { testDatabase } from './helpers.js';
import { Auth } from '../packages/domain/src/auth.js';
import { Platform } from '../packages/domain/src/platform.js';

let instance: Awaited<ReturnType<typeof testDatabase>>, auth: Auth, platform: Platform;
let admin: { token: string; csrf: string };
beforeAll(async () => {
  instance = await testDatabase();
  auth = new Auth(instance.db, randomBytes(32));
  platform = new Platform(auth);
  const guest = await auth.context();
  await auth.setup(guest.token!, guest.csrf, {
    name: 'People owner',
    email: 'people-owner@example.invalid',
    password: 'Isolated people admin passphrase',
    demoPassword: 'Isolated fictional member password',
  });
  admin = await auth.login(
    guest.token!,
    guest.csrf,
    'people-owner@example.invalid',
    'Isolated people admin passphrase',
  );
});
afterAll(async () => {
  await instance?.close();
});

it('projects real counts, memberships and platform grants with search-independent tab totals', async () => {
  const all = await platform.clientAccounts(admin.token);
  expect(all).toMatchObject({
    total: 31,
    accountTotal: 31,
    adminTotal: 1,
    activeAdmins: 1,
    allowJoin: false,
  });
  expect(all.accounts).toHaveLength(20);
  const second = await platform.clientAccounts(admin.token, '', 2);
  expect(second.accounts).toHaveLength(11);
  expect(new Set([...all.accounts, ...second.accounts].map((account) => account.id)).size).toBe(31);
  const admins = await platform.clientAccounts(admin.token, '', 1, 'admins');
  expect(admins.accounts).toHaveLength(1);
  expect(admins.accounts[0]).toMatchObject({
    email: 'people-owner@example.invalid',
    account_active: true,
    memberships: [],
    defaultClientId: '',
  });
  expect(admins.accounts[0].global_admin_id).toBeTruthy();
  const missing = await platform.clientAccounts(admin.token, 'not-a-person', 1, 'admins');
  expect(missing).toMatchObject({ total: 0, accountTotal: 31, adminTotal: 1, activeAdmins: 1 });
  const member = await platform.clientAccounts(admin.token, 'demo.1.3@example.invalid');
  expect(member.accounts[0].memberships).toHaveLength(1);
  expect(member.accounts[0].global_admin_id).toBeNull();
});

it('paginates filtered Global Admins server-side and retains inactive grants without treating them as active authority', async () => {
  const members = (
    await instance.db.pool.query("SELECT id FROM users WHERE email LIKE 'demo.%' ORDER BY email")
  ).rows;
  for (const member of members.slice(0, 23))
    await instance.db.pool.query(
      "INSERT INTO role_assignments(id,user_id,role,environment,scope_type,scope_key,granted_by,reason) VALUES($1,$2,'admin','test','platform','platform',$2,'People directory isolated fixture')",
      [randomUUID(), member.id],
    );
  await instance.db.pool.query('UPDATE users SET active=false WHERE id=$1', [members[0].id]);
  await instance.db.pool.query(
    "UPDATE role_assignments SET starts_at=now()+interval '1 day' WHERE user_id=$1 AND scope_type='platform'",
    [members[1].id],
  );
  await instance.db.pool.query(
    "UPDATE role_assignments SET ends_at=now() WHERE user_id=$1 AND scope_type='platform'",
    [members[2].id],
  );
  const first = await platform.clientAccounts(admin.token, '', 1, 'admins');
  const second = await platform.clientAccounts(admin.token, '', 2, 'admins');
  expect(first).toMatchObject({ accountTotal: 30, adminTotal: 22, activeAdmins: 21, total: 22 });
  expect(first.accounts).toHaveLength(20);
  expect(second.accounts).toHaveLength(2);
  const combined = [...first.accounts, ...second.accounts];
  expect(new Set(combined.map((account) => account.id)).size).toBe(22);
  expect(combined.find((account) => account.id === members[0].id)?.account_active).toBe(false);
  expect(
    combined.some((account) => account.id === members[1].id || account.id === members[2].id),
  ).toBe(false);
  const search = await platform.clientAccounts(admin.token, 'people-owner', 1, 'admins');
  expect(search.total).toBe(1);
  expect(search.adminTotal).toBe(22);
  // Matching stale imported accounts remain visible, while grant eligibility stays false.
  await instance.db.pool.query(
    "UPDATE users SET origin='primary_import',permissions_synced_at=now()-interval '1 hour' WHERE id=$1",
    [members[3].id],
  );
  const stale = await platform.clientAccounts(admin.token, '', 1, 'admins');
  expect(stale.accounts.find((account) => account.id === members[3].id)?.account_active).toBe(
    false,
  );
  expect(stale.activeAdmins).toBe(20);
});

it('rejects ordinary members and invalid directory filters', async () => {
  const guest = await auth.context();
  const member = await auth.login(
    guest.token!,
    guest.csrf,
    'demo.3.9@example.invalid',
    'Isolated fictional member password',
  );
  await expect(platform.clientAccounts(member.token, '', 1, 'admins')).rejects.toMatchObject({
    status: 403,
  });
  await expect(platform.clientAccounts(admin.token, '', 0)).rejects.toMatchObject({ status: 422 });
  await expect(
    platform.clientAccounts(admin.token, '', 1, 'invalid' as 'all'),
  ).rejects.toMatchObject({ status: 422 });
});
