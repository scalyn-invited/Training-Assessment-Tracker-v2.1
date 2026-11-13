import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { testDatabase } from './helpers.js';
import { Auth } from '../packages/domain/src/auth.js';
import { Tenancy } from '../packages/domain/src/tenancy.js';
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
it('requires selected-client administration and valid member/team authority', async () => {
  await expect(
    enrolments.create(coordinator.token, coordinator.csrf, client, input()),
  ).rejects.toMatchObject({ status: 403 });
  await expect(enrolments.create(admin.token, admin.csrf, other, input())).rejects.toMatchObject({
    status: 403,
  });
  await expect(
    enrolments.create(admin.token, admin.csrf, client, { ...input(), coordinatorId: memberId }),
  ).rejects.toMatchObject({ status: 422 });
  await expect(
    enrolments.create(admin.token, admin.csrf, client, { ...input(), groupId: randomUUID() }),
  ).rejects.toMatchObject({ status: 422 });
  expect(
    (await enrolments.choices(admin.token, client)).members.some((m) => m.id === memberId),
  ).toBe(true);
  await expect(enrolments.choices(member.token, client)).rejects.toMatchObject({ status: 403 });
});
it('creates onboarding records without granting sensitive access or training access to administrators', async () => {
  const saved = await enrolments.create(admin.token, admin.csrf, client, input());
  record = saved.id;
  expect(saved.status).toBe('onboarding');
  expect((await enrolments.list(admin.token, client)).total).toBe(0);
  const own = await enrolments.list(member.token, client);
  expect(own.records[0]).toMatchObject({ id: record, canDetails: true, canManage: false });
  const review = await enrolments.list(coordinator.token, client);
  expect(review.records[0]).toMatchObject({ id: record, canDetails: false, canManage: false });
  expect((await enrolments.list(member.token, client, 'missing')).total).toBe(0);
  expect((await enrolments.list(member.token, client, '', 99)).total).toBe(1);
  expect((await enrolments.list(member.token, client, '', 99)).records).toEqual([]);
});
it('requires explicit replacement of a different primary allocation', async () => {
  await expect(
    enrolments.create(admin.token, admin.csrf, client, { ...input(), coordinatorId: backupId }),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (await instance.db.pool.query('SELECT count(*)::int total FROM enrolments')).rows[0].total,
  ).toBe(1);
});
it('combines sensitive grants with primary and historical team authority for management', async () => {
  const allocation = (
    await instance.db.pool.query(
      "SELECT id FROM coordinator_allocations WHERE member_membership_id=$1 AND kind='primary' AND ends_at IS NULL",
      [memberId],
    )
  ).rows[0].id;
  const actor = (await auth.context(admin.token)).user!;
  await instance.db.pool.query(
    "INSERT INTO client_sensitive_grants(id,organisation_id,environment,allocation_id,granted_by,reason) VALUES($1,$2,'test',$3,$4,$5)",
    [randomUUID(), client, allocation, actor.id, reason],
  );
  expect((await enrolments.list(coordinator.token, client)).records[0]).toMatchObject({
    canDetails: true,
    canManage: true,
  });
  await instance.db.pool.query(
    'UPDATE client_team_memberships SET ends_at=now() WHERE client_membership_id=$1 AND group_id=$2 AND ends_at IS NULL',
    [memberId, team],
  );
  expect((await enrolments.list(coordinator.token, client)).total).toBe(0);
  await instance.db.pool.query(
    "INSERT INTO client_team_memberships(id,organisation_id,environment,client_membership_id,group_id) VALUES($1,$2,'test',$3,$4)",
    [randomUUID(), client, memberId, team],
  );
  expect((await enrolments.list(coordinator.token, client)).total).toBe(0);
  expect((await enrolments.list(member.token, client)).total).toBe(1);
});

it('does not restore historical teamless records through a replacement allocation', async () => {
  const created = await enrolments.create(admin.token, admin.csrf, client, {
    ...input(),
    groupId: null,
    title: 'Historical teamless record',
  });
  expect(
    (await enrolments.list(coordinator.token, client)).records.some((r) => r.id === created.id),
  ).toBe(true);
  const old = (
    await instance.db.pool.query(
      "UPDATE coordinator_allocations SET ends_at=now() WHERE member_membership_id=$1 AND kind='primary' AND ends_at IS NULL RETURNING *",
      [memberId],
    )
  ).rows[0];
  await instance.db.pool.query(
    "INSERT INTO coordinator_allocations(id,organisation_id,environment,member_membership_id,coordinator_membership_id,kind,assigned_by,reason) VALUES($1,$2,'test',$3,$4,'primary',$5,$6)",
    [randomUUID(), client, memberId, reviewerId, old.assigned_by, reason],
  );
  expect(
    (await enrolments.list(coordinator.token, client)).records.some((r) => r.id === created.id),
  ).toBe(false);
  expect(
    (await enrolments.list(member.token, client)).records.some((r) => r.id === created.id),
  ).toBe(true);
});
