import { LearningKpis } from '../packages/domain/src/learning-kpis.js';
import { setTimeout as delay } from 'node:timers/promises';
import { LearningLifecycle } from '../packages/domain/src/learning-lifecycle.js';
import { LearningGrading } from '../packages/domain/src/learning-grading.js';
import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { testDatabase } from './helpers.js';
import { Auth } from '../packages/domain/src/auth.js';
import { Tenancy } from '../packages/domain/src/tenancy.js';
import { Enrolments } from '../packages/domain/src/enrolments.js';
import { Onboarding } from '../packages/domain/src/onboarding.js';
import { LearningPlans } from '../packages/domain/src/learning-plans.js';
import { Delivery } from '../packages/domain/src/delivery.js';
import { digest, encrypt } from '../packages/domain/src/crypto.js';
import type { LearningBlock } from '../packages/domain/src/programme-content.js';
let instance: Awaited<ReturnType<typeof testDatabase>>,
  auth: Auth,
  tenancy: Tenancy,
  enrolments: Enrolments,
  onboarding: Onboarding;
let admin: { token: string; csrf: string },
  coordinator: { token: string; csrf: string },
  member: { token: string; csrf: string };
let team: string;
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
  team = (await instance.db.pool.query('SELECT id FROM groups WHERE organisation_id=$1', [client]))
    .rows[0].id;
  record = (
    await enrolments.create(admin.token, admin.csrf, client, {
      memberId,
      coordinatorId: reviewerId,
      groupId: team,
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
const inputs = {
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
const service = () => new LearningPlans(onboarding);
async function prepare(start = '2090-01-02') {
  const id = (
    await enrolments.create(admin.token, admin.csrf, client, {
      memberId,
      coordinatorId: reviewerId,
      groupId: team,
      title: 'Versioned curriculum',
      reason,
    })
  ).id;
  let version = 0;
  for (const [step, data] of Object.entries({
    ...inputs,
    schedule: { ...schedule, start_date: start, weekdays: [1], capacity_minutes: 30 },
  })) {
    const saved = await onboarding.save(
      coordinator.token,
      coordinator.csrf,
      client,
      id,
      step as any,
      data,
      version,
      step === 'assessment',
    );
    version = saved.version;
  }
  const view = await onboarding.read(coordinator.token, client, id);
  if (!view.calendar)
    await onboarding.confirmCalendar(
      coordinator.token,
      coordinator.csrf,
      client,
      id,
      0,
      version,
      reason,
    );
  const plan = await service().create(
    coordinator.token,
    coordinator.csrf,
    client,
    id,
    0,
    version,
    'Create the reviewed curriculum draft',
  );
  return { id, plan, onboardingVersion: version };
}
function blockInput(block: LearningBlock) {
  return {
    ...block,
    objective: 'Apply safe practice',
    prerequisites: 'Complete induction',
    competency: 1,
    criterion_one: 'Safe method',
    criterion_two: 'Evidence quality',
    weight_one: 0.5,
    weight_two: 0.5,
    lessons: block.lessons.map((l) => ({
      ...l,
      title: 'Safe practice',
      explanation: 'Review the method.',
      example: 'Observe a worked example.',
      activity: 'Demonstrate safe practice.',
      tools: 'Use the supplied handbook.',
      completion: 'Record an observed demonstration.',
      reading: 5,
      practice: 15,
      assessment: 5,
      revision: 5,
      kpi: 1,
    })),
  };
}
async function fill(a: Awaited<ReturnType<typeof prepare>>) {
  let version = a.plan.version;
  const view = await service().read(coordinator.token, client, a.id);
  for (const [index, block] of view.plan.content.blocks.entries()) {
    version = (
      await service().edit(
        coordinator.token,
        coordinator.csrf,
        client,
        a.id,
        version,
        index,
        blockInput(block),
        'Complete all lesson content for review',
      )
    ).version;
  }
  return version;
}
async function submit(id: string, version: number) {
  return service().review(coordinator.token, coordinator.csrf, client, id, version, false, '');
}
async function approve(id: string, version: number) {
  return service().review(
    coordinator.token,
    coordinator.csrf,
    client,
    id,
    version,
    true,
    'Reviewed exact curriculum and capacity',
  );
}

const delivery = () => new Delivery(service()),
  kpis = () => new LearningKpis(delivery());
let active: string, metric: string, manual: string;
const definition = {
  name: 'Verified outcome',
  rationale: 'Measure workplace performance',
  unit: 'cases',
  target: 10,
  baseline: 'unknown',
  direction: 'higher' as const,
  formula: 'manual_mean' as const,
  sample_minimum: 2,
  evidence_type: 'workplace_outcome' as const,
};
beforeAll(async () => {
  const a = await prepare('2027-01-11');
  active = a.id;
  const version = await fill(a);
  await submit(active, version);
  await approve(active, version);
  const e = (await instance.db.pool.query('SELECT version FROM enrolments WHERE id=$1', [active]))
    .rows[0];
  await delivery().activate(coordinator.token, coordinator.csrf, client, active, e.version, reason);
  metric = (await kpis().read(coordinator.token, client, active)).metrics[0].id;
});
it('restricts current authority and preserves comparability and future effective versions', async () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  await expect(
    kpis().revise(member.token, member.csrf, client, active, metric, definition, future, reason),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    kpis().revise(
      coordinator.token,
      coordinator.csrf,
      client,
      active,
      metric,
      { ...definition, formula: 'approved_grade_mean' },
      future,
      reason,
    ),
  ).rejects.toMatchObject({ code: 'metric_comparability' });
  await expect(
    kpis().revise(
      coordinator.token,
      coordinator.csrf,
      client,
      active,
      metric,
      { ...definition, direction: 'band' },
      future,
      reason,
    ),
  ).rejects.toMatchObject({ code: 'metric_band' });
  await expect(
    kpis().revise(
      coordinator.token,
      coordinator.csrf,
      client,
      active,
      metric,
      definition,
      '2000-01-01T00:00:00Z',
      reason,
    ),
  ).rejects.toMatchObject({ code: 'metric_effective' });
  const revised = await kpis().revise(
    coordinator.token,
    coordinator.csrf,
    client,
    active,
    metric,
    definition,
    future,
    reason,
  );
  let read = await kpis().read(coordinator.token, client, active);
  expect(read.metrics[0].id).toBe(metric);
  expect(read.metrics[0].latest?.id).toBe(revised.id);
  expect((await kpis().read(member.token, client, active)).metrics[0].latest).toBeNull();
  await expect(
    kpis().observe(
      coordinator.token,
      coordinator.csrf,
      client,
      active,
      revised.id,
      12,
      'Verified workplace record',
      reason,
    ),
  ).rejects.toMatchObject({ code: 'metric_observation' });
  await expect(
    kpis().revise(
      coordinator.token,
      coordinator.csrf,
      client,
      active,
      metric,
      definition,
      future,
      reason,
    ),
  ).rejects.toMatchObject({ code: 'metric_changed' });
  const next = await kpis().revise(
    coordinator.token,
    coordinator.csrf,
    client,
    active,
    revised.id,
    definition,
    new Date(Date.now() + 1000).toISOString(),
    reason,
  );
  manual = next.id;
  await delay(1100);
  read = await kpis().read(coordinator.token, client, active);
  expect(read.metrics[0].id).toBe(manual);
  expect(read.metrics[0].snapshot).toBeNull();
});
it('keeps insufficient samples nonnumeric and records encrypted verified evidence with immutable lineage', async () => {
  await expect(
    kpis().observe(
      coordinator.token,
      coordinator.csrf,
      client,
      active,
      metric,
      12,
      'Verified workplace record',
      reason,
    ),
  ).rejects.toMatchObject({ code: 'metric_observation' });
  await expect(
    kpis().observe(
      member.token,
      member.csrf,
      client,
      active,
      manual,
      12,
      'Verified workplace record',
      reason,
    ),
  ).rejects.toMatchObject({ status: 403 });
  const first = await kpis().observe(
    coordinator.token,
    coordinator.csrf,
    client,
    active,
    manual,
    8,
    'Verified workplace record one',
    reason,
  );
  expect(first.snapshot.value).toBeNull();
  expect(first.snapshot.status).toBe('insufficient_evidence');
  const second = await kpis().observe(
    coordinator.token,
    coordinator.csrf,
    client,
    active,
    manual,
    12,
    'Verified workplace record two',
    reason,
  );
  expect(second.snapshot.value).toBe(10);
  expect(second.snapshot.status).toBe('on_target');
  const v = await kpis().read(member.token, client, active);
  expect(v.metrics[0].snapshot?.sourceIds).toEqual([first.id, second.id]);
  expect(JSON.stringify(v)).not.toContain('Verified workplace record');
  const stored = (
    await instance.db.pool.query('SELECT evidence FROM kpi_observations WHERE id=$1', [first.id])
  ).rows[0];
  expect(stored.evidence).not.toContain('workplace');
  await expect(
    instance.db.pool.query('UPDATE kpi_versions SET reason=$1 WHERE id=$2', ['overwrite', manual]),
  ).rejects.toBeDefined();
  await expect(
    instance.db.pool.query('DELETE FROM kpi_observations WHERE id=$1', [first.id]),
  ).rejects.toBeDefined();
  const fresh = await kpis().refresh(coordinator.token, coordinator.csrf, client, active, manual);
  expect(fresh.id).not.toBe(second.snapshot.id);
  expect(fresh.value).toBe(10);
});
it('bounds evidence and numeric input and evaluates lower and band targets without rewriting history', async () => {
  await expect(
    kpis().observe(
      coordinator.token,
      coordinator.csrf,
      client,
      active,
      manual,
      NaN,
      'Verified workplace record',
      reason,
    ),
  ).rejects.toMatchObject({ code: 'metric_observation' });
  await expect(
    kpis().observe(
      coordinator.token,
      coordinator.csrf,
      client,
      active,
      manual,
      12,
      'short',
      reason,
    ),
  ).rejects.toBeDefined();
  const revised = await kpis().revise(
    coordinator.token,
    coordinator.csrf,
    client,
    active,
    manual,
    { ...definition, direction: 'band', target: 8, upper_target: 12, sample_minimum: 1 },
    new Date(Date.now() + 1000).toISOString(),
    reason,
  );
  await delay(1100);
  const sample = await kpis().observe(
    coordinator.token,
    coordinator.csrf,
    client,
    active,
    revised.id,
    13,
    'Verified later workplace record',
    reason,
  );
  expect(sample.snapshot.status).toBe('needs_support');
  expect(
    (await kpis().refresh(coordinator.token, coordinator.csrf, client, active, manual)).value,
  ).toBe(10);
  const lower = await kpis().revise(
    coordinator.token,
    coordinator.csrf,
    client,
    active,
    revised.id,
    { ...definition, direction: 'lower', sample_minimum: 1 },
    new Date(Date.now() + 1000).toISOString(),
    reason,
  );
  await delay(1100);
  expect(
    (
      await kpis().observe(
        coordinator.token,
        coordinator.csrf,
        client,
        active,
        lower.id,
        9,
        'Verified lower target record',
        reason,
      )
    ).snapshot.status,
  ).toBe('on_target');
});

it('serializes competing revisions and rechecks revoked coordinator authority', async () => {
  const latest = (await kpis().read(coordinator.token, client, active)).metrics[0].latest!;
  const concurrent = await Promise.allSettled(
    [1, 2].map(() =>
      kpis().revise(
        coordinator.token,
        coordinator.csrf,
        client,
        active,
        latest.id,
        definition,
        new Date(Date.now() + 86400000).toISOString(),
        reason,
      ),
    ),
  );
  expect(concurrent.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
  expect(concurrent.filter((x) => x.status === 'rejected')).toHaveLength(1);
  await instance.db.pool.query('UPDATE coordinator_allocations SET ends_at=now() WHERE id=$1', [
    allocation,
  ]);
  await expect(
    kpis().refresh(coordinator.token, coordinator.csrf, client, active, manual),
  ).rejects.toBeDefined();
  await expect(
    kpis().observe(
      coordinator.token,
      coordinator.csrf,
      client,
      active,
      manual,
      10,
      'Verified workplace observation',
      reason,
    ),
  ).rejects.toBeDefined();
});
