import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { testDatabase } from './helpers.js';
import { Auth } from '../packages/domain/src/auth.js';
import { Tenancy } from '../packages/domain/src/tenancy.js';
import { Enrolments } from '../packages/domain/src/enrolments.js';
import { Onboarding } from '../packages/domain/src/onboarding.js';
import { onboardingSchema } from '../packages/domain/src/onboarding-content.js';
let instance: Awaited<ReturnType<typeof testDatabase>>,
  auth: Auth,
  tenancy: Tenancy,
  enrolments: Enrolments,
  onboarding: Onboarding;
let admin: { token: string; csrf: string },
  coordinator: { token: string; csrf: string },
  member: { token: string; csrf: string };
let client: string,
  other: string,
  record: string,
  memberId: string,
  reviewerId: string,
  allocation: string;
const reason = 'Confirm reviewed member availability';
const assessment = {
  source: 'Original interview',
  provider: 'Coordinator',
  date: '2026-01-01',
  scale: 'Not scored',
  findings: 'Observed safe practice',
  kind: 'observed evidence',
};
const schedule = {
  duration: 4,
  daily_minutes: 30,
  capacity_minutes: 60,
  start_date: '2027-01-11',
  timezone: 'Asia/Manila',
  weekdays: [1, 2, 3, 4, 5],
  holidays: [],
  absences: [],
};
beforeAll(async () => {
  instance = await testDatabase();
  auth = new Auth(instance.db, randomBytes(32));
  tenancy = new Tenancy(auth);
  enrolments = new Enrolments(auth);
  onboarding = new Onboarding(enrolments, randomBytes(32));
  const guest = await auth.context();
  await auth.setup(guest.token!, guest.csrf, {
    name: 'Admin',
    email: 'admin@example.invalid',
    password: 'Unique administrator passphrase',
    demoPassword: 'Separate demonstration password',
  });
  async function login(email: string, password = 'Separate demonstration password') {
    const g = await auth.context();
    return auth.login(g.token!, g.csrf, email, password);
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
  record = (
    await enrolments.create(admin.token, admin.csrf, client, {
      memberId,
      coordinatorId: reviewerId,
      groupId: null,
      title: 'Calendar onboarding',
      reason,
    })
  ).id;
  allocation = (
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
});
afterAll(async () => {
  await instance?.close();
});
it('keeps partial drafts encrypted, immutable and exact-versioned', async () => {
  expect((await onboarding.read(member.token, client, record)).version).toBe(0);
  await onboarding.save(
    member.token,
    member.csrf,
    client,
    record,
    'profile',
    { current_role: 'Private learner role', confirmed_by: 'forged' },
    0,
  );
  const read = await onboarding.read(member.token, client, record);
  expect(read.data.profile).toEqual({ current_role: 'Private learner role' });
  const stored = (await instance.db.pool.query('SELECT * FROM onboarding_versions')).rows[0];
  expect(stored.data).not.toContain('Private learner role');
  await expect(
    instance.db.pool.query('UPDATE onboarding_versions SET version=9 WHERE id=$1', [stored.id]),
  ).rejects.toThrow('immutable');
  await expect(
    instance.db.pool.query('DELETE FROM onboarding_versions WHERE id=$1', [stored.id]),
  ).rejects.toThrow('immutable');
  await expect(
    onboarding.save(
      member.token,
      member.csrf,
      client,
      record,
      'profile',
      { current_role: 'Stale' },
      0,
    ),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    onboarding.save(member.token, member.csrf, other, record, 'profile', {}, 1),
  ).rejects.toMatchObject({ status: 403 });
  await expect(onboarding.read(admin.token, client, record)).rejects.toMatchObject({ status: 404 });
});
it('requires independent coordinator confirmation and clears it on ordinary edits', async () => {
  await expect(
    onboarding.save(
      member.token,
      member.csrf,
      client,
      record,
      'capability',
      { target_role: 'Supervisor' },
      1,
    ),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    onboarding.save(member.token, member.csrf, client, record, 'assessment', assessment, 1, true),
  ).rejects.toMatchObject({ status: 403 });
  await onboarding.save(
    coordinator.token,
    coordinator.csrf,
    client,
    record,
    'assessment',
    assessment,
    1,
    true,
  );
  expect(
    (await onboarding.read(member.token, client, record)).data.assessment?.confirmed_by,
  ).toBeTruthy();
  await onboarding.save(
    member.token,
    member.csrf,
    client,
    record,
    'assessment',
    { ...assessment, confirmed_by: 'forged' },
    2,
  );
  expect(
    (await onboarding.read(member.token, client, record)).data.assessment?.confirmed_by,
  ).toBeUndefined();
  await expect(
    onboarding.save(
      coordinator.token,
      coordinator.csrf,
      client,
      record,
      'assessment',
      { findings: 'Incomplete' },
      3,
      true,
    ),
  ).rejects.toThrow();
});
it('validates source durations, limits, nested metadata and complete inputs', () => {
  for (const duration of [4, 6, 8, 10, 12])
    expect(onboardingSchema('schedule', true).safeParse({ ...schedule, duration }).success).toBe(
      true,
    );
  for (const change of [
    { duration: 30 },
    { daily_minutes: 14 },
    { capacity_minutes: 121 },
    { weekdays: [1, 1] },
    { holidays: ['2027-02-29'] },
    { timezone: 'fake' },
  ])
    expect(onboardingSchema('schedule', true).safeParse({ ...schedule, ...change }).success).toBe(
      false,
    );
  expect(
    onboardingSchema('assessment', true).safeParse({ ...assessment, date: '2999-01-01' }).success,
  ).toBe(false);
  const kpis = Array.from({ length: 3 }, () => ({ name: 'Measure', confirmed_by: 'forged' }));
  expect((onboardingSchema('measures').parse({ kpis }) as any).kpis[0]).toEqual({
    name: 'Measure',
  });
  expect(onboardingSchema('measures', true).safeParse({ kpis }).success).toBe(false);
});
it('confirms exact schedule and calendar versions without changing enrolment readiness', async () => {
  await onboarding.save(member.token, member.csrf, client, record, 'schedule', schedule, 3);
  await expect(
    onboarding.confirmCalendar(member.token, member.csrf, client, record, 0, 4, reason),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    onboarding.confirmCalendar(coordinator.token, coordinator.csrf, client, record, 0, 3, reason),
  ).rejects.toMatchObject({ status: 409 });
  const confirmed = await onboarding.confirmCalendar(
    coordinator.token,
    coordinator.csrf,
    client,
    record,
    0,
    4,
    reason,
  );
  expect(confirmed.version).toBe(1);
  await expect(
    onboarding.confirmCalendar(coordinator.token, coordinator.csrf, client, record, 0, 4, reason),
  ).rejects.toMatchObject({ status: 409 });
  const read = await onboarding.read(member.token, client, record);
  expect(read.calendar).toMatchObject({ daily_minutes: 60, version: 1 });
  expect(read.enrolment.status).toBe('onboarding');
  expect(read.calendar).not.toHaveProperty('actor_id');
  expect(read.calendar).not.toHaveProperty('organisation_id');
});
it('shares member capacity between programmes and rejects conflicting calendar changes', async () => {
  const e = (await instance.db.pool.query('SELECT * FROM enrolments WHERE id=$1', [record]))
    .rows[0];
  const draft = await onboarding.latest(instance.db.pool, e),
    calendar = await onboarding.calendar(instance.db.pool, e);
  const programme = randomUUID();
  await instance.db.pool.query(
    "INSERT INTO programme_versions(id,organisation_id,environment,enrolment_id,onboarding_version_id,member_calendar_id,version,content,reason,actor_id) VALUES($1,$2,'test',$3,$4,$5,1,'encrypted-fixture',$6,$7)",
    [programme, client, record, draft!.id, calendar!.id, reason, e.coordinator_id],
  );
  await instance.db.pool.query(
    "INSERT INTO capacity_allocations(id,organisation_id,environment,programme_version_id,enrolment_id,member_id,day,minutes) VALUES($1,$2,'test',$3,$4,$5,'2027-01-11',45)",
    [randomUUID(), client, programme, record, e.member_id],
  );
  await expect(
    onboarding.calendarRules.assertCapacity(instance.db.pool, calendar!, { '2027-01-11': 16 }),
  ).rejects.toMatchObject({ code: 'capacity_exceeded' });
  await onboarding.calendarRules.assertCapacity(instance.db.pool, calendar!, { '2027-01-11': 15 });
  await onboarding.calendarRules.assertCapacity(
    instance.db.pool,
    calendar!,
    { '2027-01-11': 60 },
    record,
  );
  await onboarding.save(
    member.token,
    member.csrf,
    client,
    record,
    'schedule',
    { ...schedule, absences: ['2027-01-11'] },
    4,
  );
  await expect(
    onboarding.confirmCalendar(coordinator.token, coordinator.csrf, client, record, 1, 5, reason),
  ).rejects.toMatchObject({ code: 'capacity_exceeded' });
  await onboarding.save(
    member.token,
    member.csrf,
    client,
    record,
    'schedule',
    { ...schedule, timezone: 'UTC' },
    5,
  );
  await expect(
    onboarding.confirmCalendar(coordinator.token, coordinator.csrf, client, record, 1, 6, reason),
  ).rejects.toMatchObject({ code: 'calendar_timezone_conflict' });
  expect((await onboarding.read(member.token, client, record)).calendar!.version).toBe(1);
});
it('requires every complete step and a trusted assessment confirmation before plan creation', async () => {
  const { encrypt } = await import('../packages/domain/src/crypto.js');
  const data = {
    profile: {
      current_role: 'Member',
      responsibilities: 'Practice',
      experience: 'One year',
      tools: 'Laptop',
      preferences: 'English',
    },
    capability: {
      target_role: 'Supervisor',
      purpose: 'Safe practice',
      proficiency: 'Independent',
      success: 'Complete tasks',
      prerequisites: 'Induction',
      competencies: 'Safety',
    },
    assessment,
    schedule,
    measures: {
      kpis: Array.from({ length: 3 }, (_, i) => ({
        name: 'Measure ' + i,
        baseline: 'unknown',
        target: '90',
        unit: 'percent',
        rationale: 'Safety',
        evidence: 'Observation',
        cadence: 'Weekly',
      })),
    },
    resources: {
      title: 'Guide',
      reference: 'Internal handbook',
      licence: 'Internal use',
      cost: 'No cost',
      access: 'Access checked',
      tasks: 'Safe practice',
    },
  };
  const draft = {
    id: randomUUID(),
    version: 1,
    last_step: 'assessment' as const,
    created_at: new Date(),
    data: encrypt(JSON.stringify(data), onboarding.key),
  };
  expect(() => onboarding.complete(draft)).toThrow('coordinator must confirm');
  const confirmed = {
    ...data,
    assessment: { ...assessment, confirmed_by: (await auth.context(coordinator.token)).user!.id },
  };
  draft.data = encrypt(JSON.stringify(confirmed), onboarding.key);
  expect(onboarding.complete(draft).assessment?.confirmed_by).toBeTruthy();
  draft.data = encrypt(JSON.stringify({ ...confirmed, resources: {} }), onboarding.key);
  expect(() => onboarding.complete(draft)).toThrow();
});
it('uses the same calendar for a second enrolment without leaking calendar audit metadata', async () => {
  const second = await enrolments.create(admin.token, admin.csrf, client, {
    memberId,
    coordinatorId: reviewerId,
    groupId: null,
    title: 'Concurrent programme',
    reason,
  });
  const first = await onboarding.read(member.token, client, record),
    next = await onboarding.read(member.token, client, second.id);
  expect(next.calendar).toEqual(first.calendar);
  expect(next.data).toEqual({});
  expect(next.version).toBe(0);
  expect(next.calendar).not.toHaveProperty('reason');
  expect(next.calendar).not.toHaveProperty('member_id');
});
it('revocation and active training block later mutations without losing history', async () => {
  await instance.db.pool.query(
    'UPDATE client_sensitive_grants SET ends_at=now() WHERE allocation_id=$1',
    [allocation],
  );
  await expect(
    onboarding.save(coordinator.token, coordinator.csrf, client, record, 'profile', {}, 6),
  ).rejects.toMatchObject({ status: 404 });
  await instance.db.pool.query("UPDATE enrolments SET status='active' WHERE id=$1", [record]);
  await expect(
    onboarding.save(member.token, member.csrf, client, record, 'profile', {}, 6),
  ).rejects.toMatchObject({ status: 409 });
  expect((await onboarding.read(member.token, client, record)).version).toBe(6);
});
