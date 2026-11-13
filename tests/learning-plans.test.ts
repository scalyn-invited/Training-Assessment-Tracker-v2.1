import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { testDatabase } from './helpers.js';
import { Auth } from '../packages/domain/src/auth.js';
import { Tenancy } from '../packages/domain/src/tenancy.js';
import { Enrolments } from '../packages/domain/src/enrolments.js';
import { Onboarding } from '../packages/domain/src/onboarding.js';
import { LearningPlans } from '../packages/domain/src/learning-plans.js';
import { digest } from '../packages/domain/src/crypto.js';
import type { LearningBlock } from '../packages/domain/src/programme-content.js';
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
      groupId: null,
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
it('requires complete current confirmed inputs and preserves dates against request tampering', async () => {
  await expect(
    service().create(coordinator.token, coordinator.csrf, client, record, 0, 1, reason),
  ).rejects.toMatchObject({ code: 'onboarding_conflict' });
  const a = await prepare();
  const view = await service().read(coordinator.token, client, a.id);
  expect(view.plan.content.blocks).toHaveLength(4);
  await expect(
    service().create(member.token, member.csrf, client, a.id, 1, 6, reason),
  ).rejects.toMatchObject({ status: 403 });
  await expect(service().read(admin.token, client, a.id)).rejects.toMatchObject({ status: 404 });
  await expect(service().read(coordinator.token, other, a.id)).rejects.toMatchObject({
    status: 403,
  });
  await expect(submit(a.id, a.plan.version)).rejects.toMatchObject({
    code: 'programme_incomplete',
  });
  const input = blockInput(view.plan.content.blocks[0]);
  const original = input.lessons[0].date;
  input.lessons[0].date = '2000-01-01';
  input.start = '2000-01-01';
  input.freeze_at = 'forged';
  await service().edit(coordinator.token, coordinator.csrf, client, a.id, 1, 0, input, reason);
  const edited = await service().read(coordinator.token, client, a.id);
  expect(edited.plan.content.blocks[0].lessons[0].date).toBe(original);
  expect(edited.plan.content.blocks[0].start).toBe(view.plan.content.blocks[0].start);
  await expect(
    service().edit(coordinator.token, coordinator.csrf, client, a.id, 1, 0, input, reason),
  ).rejects.toMatchObject({ code: 'programme_conflict' });
});
it('requires bounded content, criterion weights, source KPIs and the full daily budget', async () => {
  const a = await prepare('2090-03-01');
  let version = await fill(a);
  let view = await service().read(coordinator.token, client, a.id);
  for (const alter of [
    (b: LearningBlock) => {
      b.weight_two = 0.8;
    },
    (b: LearningBlock) => {
      b.lessons[0].revision = 6;
    },
    (b: LearningBlock) => {
      b.lessons[0].kpi = 5;
    },
    (b: LearningBlock) => {
      b.competency = 2;
    },
  ]) {
    const block = blockInput(view.plan.content.blocks[0]);
    alter(block);
    version = (
      await service().edit(
        coordinator.token,
        coordinator.csrf,
        client,
        a.id,
        version,
        0,
        block,
        reason,
      )
    ).version;
    await expect(submit(a.id, version)).rejects.toMatchObject({ code: 'programme_incomplete' });
  }
  expect(
    (await instance.db.pool.query('SELECT count(*)::int n FROM programme_approvals')).rows[0].n,
  ).toBe(0);
});
it('approves exact content, preserves approved history and atomically replaces reservations', async () => {
  const a = await prepare('2090-05-01'),
    version = await fill(a);
  await expect(approve(a.id, version)).rejects.toMatchObject({ code: 'programme_state' });
  await submit(a.id, version);
  await approve(a.id, version);
  const approved = await service().read(member.token, client, a.id);
  expect(approved.enrolment.status).toBe('ready');
  expect(approved.plan.state).toBe('approved');
  expect(approved.approval.content_hash).toBe(digest(JSON.stringify(approved.plan.content)));
  expect(
    (
      await instance.db.pool.query(
        'SELECT count(*)::int n FROM capacity_allocations WHERE enrolment_id=$1 AND active',
        [a.id],
      )
    ).rows[0].n,
  ).toBe(4);
  const raw = (
    await instance.db.pool.query('SELECT content FROM programme_versions WHERE id=$1', [
      approved.plan.id,
    ])
  ).rows[0].content;
  expect(raw).not.toContain('safe practice');
  await expect(
    instance.db.pool.query("UPDATE programme_versions SET content='changed' WHERE id=$1", [
      approved.plan.id,
    ]),
  ).rejects.toThrow('immutable');
  await expect(
    instance.db.pool.query('DELETE FROM programme_approvals WHERE programme_version_id=$1', [
      approved.plan.id,
    ]),
  ).rejects.toThrow('immutable');
  const next = await service().edit(
    coordinator.token,
    coordinator.csrf,
    client,
    a.id,
    version,
    0,
    blockInput(approved.plan.content.blocks[0]),
    'Clarify the approved lesson safely',
  );
  expect((await service().read(coordinator.token, client, a.id, version)).plan).toMatchObject({
    state: 'approved',
    content: approved.plan.content,
  });
  await expect(approve(a.id, version)).rejects.toMatchObject({ code: 'programme_conflict' });
  await submit(a.id, next.version);
  await approve(a.id, next.version);
  expect((await service().read(coordinator.token, client, a.id, version)).plan.state).toBe(
    'superseded',
  );
  const counts = (
    await instance.db.pool.query(
      'SELECT active,count(*)::int n FROM capacity_allocations WHERE enrolment_id=$1 GROUP BY active',
      [a.id],
    )
  ).rows;
  expect(counts).toEqual(
    expect.arrayContaining([
      { active: true, n: 4 },
      { active: false, n: 4 },
    ]),
  );
  expect(
    (
      await instance.db.pool.query(
        'SELECT count(*)::int n FROM approved_changes WHERE enrolment_id=$1',
        [a.id],
      )
    ).rows[0].n,
  ).toBe(2);
});
it('invalidates pending review on edit and blocks a second overlapping approval', async () => {
  const a = await prepare('2090-07-01'),
    b = await prepare('2090-07-01');
  let av = await fill(a);
  const bv = await fill(b);
  await submit(a.id, av);
  const old = await service().read(coordinator.token, client, a.id);
  av = (
    await service().edit(
      coordinator.token,
      coordinator.csrf,
      client,
      a.id,
      av,
      0,
      blockInput(old.plan.content.blocks[0]),
      reason,
    )
  ).version;
  expect((await service().read(coordinator.token, client, a.id, av - 1)).plan.state).toBe(
    'superseded',
  );
  await expect(approve(a.id, av)).rejects.toMatchObject({ code: 'programme_state' });
  await submit(a.id, av);
  await submit(b.id, bv);
  await approve(a.id, av);
  await expect(approve(b.id, bv)).rejects.toMatchObject({ code: 'capacity_exceeded' });
  expect((await service().read(coordinator.token, client, b.id)).plan.state).toBe('needs_review');
  expect(
    (
      await instance.db.pool.query(
        'SELECT count(*)::int n FROM capacity_allocations WHERE enrolment_id=$1',
        [b.id],
      )
    ).rows[0].n,
  ).toBe(0);
});
it('requires an explicit refreshed draft when inputs change and retains earlier lessons by position', async () => {
  const a = await prepare('2090-09-01'),
    version = await fill(a);
  await submit(a.id, version);
  let ov = (
    await onboarding.save(
      member.token,
      member.csrf,
      client,
      a.id,
      'profile',
      { ...inputs.profile, current_role: 'New role' },
      a.onboardingVersion,
    )
  ).version;
  await expect(approve(a.id, version)).rejects.toMatchObject({ code: 'programme_inputs_changed' });
  ov = (
    await onboarding.save(
      coordinator.token,
      coordinator.csrf,
      client,
      a.id,
      'schedule',
      { ...schedule, start_date: '2090-10-01', weekdays: [1], capacity_minutes: 30 },
      ov,
    )
  ).version;
  const old = await service().read(coordinator.token, client, a.id);
  const next = await service().create(
    coordinator.token,
    coordinator.csrf,
    client,
    a.id,
    version,
    ov,
    'Explicitly reschedule the future plan',
  );
  const refreshed = await service().read(coordinator.token, client, a.id);
  expect(next.version).toBe(version + 1);
  expect(refreshed.plan.content.blocks[0].lessons[0].title).toBe(
    old.plan.content.blocks[0].lessons[0].title,
  );
  expect(refreshed.plan.content.blocks[0].lessons[0].date).not.toBe(
    old.plan.content.blocks[0].lessons[0].date,
  );
  await onboarding.save(
    coordinator.token,
    coordinator.csrf,
    client,
    a.id,
    'schedule',
    { ...schedule, start_date: '2000-01-01', weekdays: [1], capacity_minutes: 30 },
    ov,
  );
  await expect(
    service().create(
      coordinator.token,
      coordinator.csrf,
      client,
      a.id,
      next.version,
      ov + 1,
      reason,
    ),
  ).rejects.toMatchObject({ code: 'past_start' });
});
it('rechecks calendar revisions and current authority before approving', async () => {
  const a = await prepare('2091-01-01'),
    version = await fill(a);
  await submit(a.id, version);
  const before = await onboarding.read(coordinator.token, client, a.id);
  await onboarding.confirmCalendar(
    coordinator.token,
    coordinator.csrf,
    client,
    a.id,
    before.calendar!.version,
    before.version,
    'Explicitly reconfirm shared availability',
  );
  await expect(approve(a.id, version)).rejects.toMatchObject({ code: 'programme_inputs_changed' });
  const refreshed = await service().create(
    coordinator.token,
    coordinator.csrf,
    client,
    a.id,
    version,
    before.version,
    'Refresh the confirmed calendar reference',
  );
  await submit(a.id, refreshed.version);
  await instance.db.pool.query(
    'UPDATE client_sensitive_grants SET ends_at=now() WHERE allocation_id=$1',
    [allocation],
  );
  await expect(approve(a.id, refreshed.version)).rejects.toMatchObject({ status: 404 });
  await expect(
    service().review(member.token, member.csrf, client, a.id, refreshed.version, true, reason),
  ).rejects.toMatchObject({ status: 403 });
  expect((await service().read(member.token, client, a.id)).plan.state).toBe('needs_review');
});
