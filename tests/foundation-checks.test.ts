import { FoundationChecks } from '../packages/domain/src/foundation-checks.js';
import { claim, enqueue } from '../packages/domain/src/outbox.js';
import { beforeAll, afterAll, it, expect, vi } from 'vitest';
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
  title: 'Local check training',
  reason,
});
const checks = () => new FoundationChecks(enrolments);
async function request(key = randomUUID()) {
  const row = (await instance.db.pool.query('SELECT version FROM enrolments WHERE id=$1', [record]))
    .rows[0];
  return checks().request(member.token, member.csrf, client, record, { version: row.version, key });
}
it('preserves the detailed record and summary-only permission boundary', async () => {
  record = (await enrolments.create(admin.token, admin.csrf, client, input())).id;
  expect(await enrolments.detail(member.token, client, record)).toMatchObject({
    id: record,
    canDetails: true,
    canUpload: true,
    canManage: false,
    memberName: 'Demo Member 1.3',
    hasCurriculum: false,
  });
  expect(await enrolments.detail(coordinator.token, client, record)).toEqual({
    id: record,
    title: 'Local check training',
    status: 'onboarding',
    canDetails: false,
  });
  await expect(enrolments.detail(admin.token, client, record)).rejects.toMatchObject({
    status: 404,
  });
  await expect(enrolments.detail(member.token, other, record)).rejects.toMatchObject({
    status: 403,
  });
});
it('commits one exact-version request and audit, and preserves idempotency before later version changes', async () => {
  const key = randomUUID(),
    first = await request(key);
  expect(await request(key)).toEqual(first);
  expect(
    (await instance.db.pool.query('SELECT id FROM foundation_checks WHERE id=$1', [first.id]))
      .rowCount,
  ).toBe(1);
  expect(
    (
      await instance.db.pool.query(
        "SELECT id FROM audit_events WHERE action='foundation.check.requested' AND target_id=$1",
        [first.id],
      )
    ).rowCount,
  ).toBe(1);
  await expect(
    checks().request(member.token, member.csrf, client, record, { version: 99, key }),
  ).rejects.toMatchObject({ code: 'idempotency_conflict' });
  await expect(
    checks().request(member.token, member.csrf, client, record, { version: 99, key: randomUUID() }),
  ).rejects.toMatchObject({ code: 'enrolment_changed' });
  await expect(
    checks().request(admin.token, admin.csrf, client, record, { version: 1, key: randomUUID() }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    checks().request(member.token, 'invalid', client, record, { version: 1, key: randomUUID() }),
  ).rejects.toMatchObject({ status: 403 });
  const job = (await claim(instance.db, ['foundation.check']))!;
  await checks().process(job);
  await expect(checks().process(job)).rejects.toMatchObject({ code: 'lease_lost' });
  expect((await checks().list(member.token, client, first.id))[0]).toMatchObject({
    state: 'delivered',
    errorCode: null,
  });
  expect(
    (
      await instance.db.pool.query(
        "SELECT id FROM audit_events WHERE action='foundation.check.completed' AND target_id=$1",
        [first.id],
      )
    ).rowCount,
  ).toBe(1);
  expect(await checks().list(coordinator.token, client)).toEqual([]);
  await expect(checks().list(coordinator.token, client, first.id)).rejects.toMatchObject({
    status: 404,
  });
  await expect(
    instance.db.pool.query('UPDATE foundation_checks SET enrolment_version=9 WHERE id=$1', [
      first.id,
    ]),
  ).rejects.toThrow();
  await instance.db.pool.query('UPDATE enrolments SET version=version+1 WHERE id=$1', [record]);
  expect(
    await checks().request(member.token, member.csrf, client, record, { version: 1, key }),
  ).toEqual(first);
});
it('rolls back both queue and audit when the request transaction fails', async () => {
  const before = (await instance.db.pool.query('SELECT count(*)::int total FROM foundation_checks'))
    .rows[0].total;
  const transaction = instance.db.transaction.bind(instance.db);
  const fault = vi.spyOn(instance.db, 'transaction').mockImplementationOnce((work) =>
    transaction(async (sql) => {
      await work(sql);
      throw new Error('Injected request rollback');
    }),
  );
  try {
    await expect(request()).rejects.toThrow('Injected request rollback');
  } finally {
    fault.mockRestore();
  }
  expect(
    (await instance.db.pool.query('SELECT count(*)::int total FROM foundation_checks')).rows[0]
      .total,
  ).toBe(before);
  expect(
    (await instance.db.pool.query("SELECT id FROM outbox_events WHERE kind='foundation.check'"))
      .rowCount,
  ).toBe(before);
});
it('cancels queued work after version or identity revocation without creating a receipt', async () => {
  const changed = await request();
  await instance.db.pool.query('UPDATE enrolments SET version=version+1 WHERE id=$1', [record]);
  await checks().process((await claim(instance.db, ['foundation.check']))!);
  expect((await checks().list(member.token, client, changed.id))[0]).toMatchObject({
    state: 'cancelled',
    errorCode: 'authority_or_version_changed',
    receiptAt: null,
  });
  const revoked = await request();
  const user = (await auth.context(member.token)).user!;
  await instance.db.pool.query('UPDATE identities SET active=false WHERE user_id=$1', [user.id]);
  await checks().process((await claim(instance.db, ['foundation.check']))!);
  expect(
    (
      await instance.db.pool.query('SELECT status,receipt_at FROM foundation_checks WHERE id=$1', [
        revoked.id,
      ])
    ).rows[0],
  ).toEqual({ status: 'cancelled', receipt_at: null });
  await instance.db.pool.query('UPDATE identities SET active=true WHERE user_id=$1', [user.id]);
});
it('recovers only local check leases, enforces three attempts, and leaves terminal receipts unchanged', async () => {
  const saved = await request();
  let job = (await claim(instance.db, ['foundation.check']))!;
  await instance.db.pool.query(
    "UPDATE outbox_events SET lease_until=now()-interval '1 second' WHERE id=$1",
    [job.id],
  );
  await checks().recover();
  await expect(checks().process(job)).rejects.toMatchObject({ code: 'lease_lost' });
  for (let attempt = 2; attempt <= 3; attempt++) {
    job = (await claim(instance.db, ['foundation.check']))!;
    expect(job.attempts).toBe(attempt);
    await checks().retry(job);
    await instance.db.pool.query('UPDATE outbox_events SET available_at=now() WHERE id=$1', [
      job.id,
    ]);
  }
  await checks().recover();
  expect(await claim(instance.db, ['foundation.check'])).toBeUndefined();
  expect((await checks().list(member.token, client, saved.id))[0]).toMatchObject({
    state: 'failed',
    errorCode: 'retry_budget_exhausted',
    receiptAt: null,
  });
  expect(
    (await instance.db.pool.query('SELECT attempts FROM outbox_events WHERE id=$1', [saved.id]))
      .rows[0].attempts,
  ).toBe(3);
  const user = (await auth.context(member.token)).user!;
  const external = await instance.db.transaction((sql) =>
    enqueue(
      sql,
      { actorId: user.id, organisationId: client, environment: 'test' },
      'external.effect',
      randomUUID(),
      {},
    ),
  );
  await claim(instance.db, ['external.effect']);
  await instance.db.pool.query(
    "UPDATE outbox_events SET lease_until=now()-interval '1 second' WHERE id=$1",
    [external],
  );
  await checks().recover();
  expect(
    (await instance.db.pool.query('SELECT status FROM outbox_events WHERE id=$1', [external]))
      .rows[0].status,
  ).toBe('processing');
});
