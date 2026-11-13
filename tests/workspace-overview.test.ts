import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { testDatabase } from './helpers.js';
import { Auth } from '../packages/domain/src/auth.js';
import { Tenancy } from '../packages/domain/src/tenancy.js';
import { Platform } from '../packages/domain/src/platform.js';
import { Enrolments } from '../packages/domain/src/enrolments.js';
let instance: Awaited<ReturnType<typeof testDatabase>>,
  auth: Auth,
  tenancy: Tenancy,
  enrolments: Enrolments;
let admin: { token: string; csrf: string },
  coordinator: { token: string; csrf: string },
  member: { token: string; csrf: string };
let client: string,
  other: string,
  memberId: string,
  reviewerId: string,
  backupId: string,
  team: string,
  record: string;
const reason = 'Create a scoped training record';
beforeAll(async () => {
  instance = await testDatabase();
  auth = new Auth(instance.db, randomBytes(32));
  tenancy = new Tenancy(auth);
  enrolments = new Enrolments(auth);
  const g = await auth.context();
  await auth.setup(g.token!, g.csrf, {
    name: 'Admin',
    email: 'admin@example.invalid',
    password: 'Unique administrator passphrase',
    demoPassword: 'Separate demonstration password',
  });
  async function login(email: string, password = 'Separate demonstration password') {
    const guest = await auth.context();
    return auth.login(guest.token!, guest.csrf, email, password);
  }
  admin = await login('admin@example.invalid', 'Unique administrator passphrase');
  coordinator = await login('demo.1.2@example.invalid');
  member = await login('demo.1.3@example.invalid');
  const clients = await tenancy.choices(admin.token);
  client = clients[0].id;
  other = clients[1].id;
  for (const s of [admin, coordinator, member]) await tenancy.select(s.token, s.csrf, client);
  const rows = (
    await instance.db.pool.query(
      'SELECT cm.id,u.email FROM client_memberships cm JOIN users u ON u.id=cm.user_id WHERE cm.organisation_id=$1',
      [client],
    )
  ).rows;
  memberId = rows.find((r) => r.email === 'demo.1.3@example.invalid').id;
  reviewerId = rows.find((r) => r.email === 'demo.1.2@example.invalid').id;
  backupId = rows.find((r) => r.email === 'demo.1.1@example.invalid').id;
  team = (await instance.db.pool.query('SELECT id FROM groups WHERE organisation_id=$1', [client]))
    .rows[0].id;
});
afterAll(async () => {
  await instance?.close();
});
const input = () => ({
  memberId,
  coordinatorId: reviewerId,
  groupId: team,
  title: 'Safe operating practice',
  reason,
});

it('derives navigation authority from current client roles rather than platform administration', async () => {
  expect(await auth.context(admin.token)).toMatchObject({
    canAdmin: true,
    canCoordinate: false,
    authMode: 'local_password',
  });
  expect(await auth.context(coordinator.token)).toMatchObject({
    canAdmin: false,
    canCoordinate: true,
  });
  expect(await auth.context(member.token)).toMatchObject({ canAdmin: false, canCoordinate: false });
  await instance.db.pool.query(
    "UPDATE role_assignments SET ends_at=now() WHERE user_id=(SELECT id FROM users WHERE email='demo.1.2@example.invalid') AND role='coordinator'",
  );
  expect((await auth.context(coordinator.token)).canCoordinate).toBe(false);
});
it('keeps platform overview counts private and reports configuration without credentials', async () => {
  const platform = new Platform(auth);
  const overview = await platform.overview(admin.token);
  expect(overview).toMatchObject({
    clients: 3,
    activeAdmins: 1,
    assignments: 1,
    identityMode: 'local_password',
    emailConfigured: false,
    aiConfigured: false,
  });
  expect(Object.keys(overview).sort()).toEqual([
    'activeAdmins',
    'aiConfigured',
    'assignments',
    'clients',
    'emailConfigured',
    'identityMode',
  ]);
  await expect(platform.overview(member.token)).rejects.toMatchObject({ status: 403 });
});
it('paginates twelve title-ordered visible plans while preserving the regular record list', async () => {
  // Restore only this fixture role after the independent capability test.
  await instance.db.pool.query(
    "UPDATE role_assignments SET ends_at=NULL WHERE user_id=(SELECT id FROM users WHERE email='demo.1.2@example.invalid') AND role='coordinator'",
  );
  for (let i = 12; i >= 0; i--)
    await enrolments.create(admin.token, admin.csrf, client, {
      ...input(),
      title: 'Plan ' + String(i).padStart(2, '0'),
    });
  const first = await enrolments.list(member.token, client, '', 1, true),
    second = await enrolments.list(member.token, client, '', 2, true);
  expect(first.total).toBe(13);
  expect(first.records).toHaveLength(12);
  expect(first.records[0]).toMatchObject({
    title: 'Plan 00',
    groupName: 'Demo team',
    durationWeeks: 4,
    dailyMinutes: 30,
  });
  expect(second.records.map((row) => row.title)).toEqual(['Plan 12']);
  expect((await enrolments.list(member.token, client)).records).toHaveLength(13);
  expect((await enrolments.list(admin.token, client, '', 1, true)).total).toBe(0);
  await expect(enrolments.list(member.token, other, '', 1, true)).rejects.toMatchObject({
    status: 403,
  });
});
