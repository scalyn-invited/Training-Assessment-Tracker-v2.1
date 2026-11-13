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
  lifecycle = () => new LearningLifecycle(delivery());
let active: string, started: string, unstarted: string, oldContent: unknown;
beforeAll(async () => {
  const a = await prepare('2027-01-11');
  active = a.id;
  const version = await fill(a);
  await submit(active, version);
  await approve(active, version);
  const e = (await instance.db.pool.query('SELECT version FROM enrolments WHERE id=$1', [active]))
    .rows[0];
  await delivery().activate(
    coordinator.token,
    coordinator.csrf,
    client,
    active,
    e.version,
    'Activate reviewed learning programme',
  );
  const blocks = (
    await instance.db.pool.query(
      'SELECT id FROM learning_blocks WHERE enrolment_id=$1 ORDER BY number',
      [active],
    )
  ).rows;
  started = blocks[0].id;
  unstarted = blocks[1].id;
  await delivery().publishQuiz(
    coordinator.token,
    coordinator.csrf,
    client,
    active,
    unstarted,
    0,
    [
      {
        prompt: 'Which method provides safe evidence?',
        options: ['Observed practice', 'Guess'],
        correct: 0,
      },
      {
        prompt: 'Which record supports the criterion?',
        options: ['Observed practice', 'Guess'],
        correct: 0,
      },
    ],
    reason,
  );

  await delivery().earlyStart(
    coordinator.token,
    coordinator.csrf,
    client,
    active,
    started,
    'Allow supervised early work',
  );
  oldContent = (await delivery().lesson(coordinator.token, client, active, started, 0)).block;
});
async function state() {
  return lifecycle().read(coordinator.token, client, active);
}
it('requires current coordinator and version; pausing retains work and blocks new drafts', async () => {
  const v = await state();
  await expect(
    lifecycle().pause(member.token, member.csrf, client, active, v.version, reason),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    lifecycle().pause(coordinator.token, coordinator.csrf, client, active, v.version + 1, reason),
  ).rejects.toMatchObject({ code: 'lifecycle_conflict' });
  await lifecycle().pause(coordinator.token, coordinator.csrf, client, active, v.version, reason);
  expect((await state()).status).toBe('paused');
  await expect(
    delivery().save(member.token, member.csrf, client, active, started, 0, 0, {
      body: 'Retain this attempted work',
      files: [],
      answers: [],
    }),
  ).rejects.toBeDefined();
});
it('previews explicit rescheduling without mutation; preserves started history on resumption', async () => {
  const v = await state();
  const p = await lifecycle().preview(
    coordinator.token,
    coordinator.csrf,
    client,
    active,
    v.version,
    2,
    reason,
  );
  expect(Object.keys(p.preview.replacements)).toHaveLength(3);
  expect(p.preview.replacements[unstarted].start).toBe('2027-02-01');
  expect(
    (await instance.db.pool.query('SELECT version FROM learning_blocks WHERE id=$1', [unstarted]))
      .rows[0].version,
  ).toBe(1);
  const raw = (
    await instance.db.pool.query('SELECT preview FROM calendar_changes WHERE id=$1', [p.id])
  ).rows[0].preview;
  expect(raw).not.toContain('2027-02-01');
  await expect(
    instance.db.pool.query("UPDATE calendar_changes SET reason='changed' WHERE id=$1", [p.id]),
  ).rejects.toBeDefined();
  await lifecycle().resume(coordinator.token, coordinator.csrf, client, active, p.id);
  expect((await state()).status).toBe('active');
  const copied = (
    await instance.db.pool.query(
      "SELECT q.* FROM objective_quizzes q JOIN learning_blocks b ON b.id=q.learning_block_id WHERE b.enrolment_id=$1 AND b.number=2 AND b.state='current'",
      [active],
    )
  ).rows[0];
  const original = (
    await instance.db.pool.query('SELECT * FROM objective_quizzes WHERE learning_block_id=$1', [
      unstarted,
    ])
  ).rows[0];
  expect(copied.id).not.toBe(original.id);
  expect(copied.questions).toBe(original.questions);
  expect(copied.answer_key).toBe(original.answer_key);

  expect((await delivery().lesson(coordinator.token, client, active, started, 0)).block).toEqual(
    oldContent,
  );
  expect(
    (
      await instance.db.pool.query(
        "SELECT count(*) n FROM learning_blocks WHERE enrolment_id=$1 AND version=2 AND state='current'",
        [active],
      )
    ).rows[0].n,
  ).toBe('3');
  await expect(
    lifecycle().resume(coordinator.token, coordinator.csrf, client, active, p.id),
  ).rejects.toMatchObject({ code: 'preview_stale' });
});
it('rejects changed calendars and capacity without partially applying a preview', async () => {
  let v = await state();
  await lifecycle().pause(coordinator.token, coordinator.csrf, client, active, v.version, reason);
  v = await state();
  const p = await lifecycle().preview(
    coordinator.token,
    coordinator.csrf,
    client,
    active,
    v.version,
    0,
    reason,
  );
  const c = (
    await instance.db.pool.query('SELECT * FROM member_calendars ORDER BY version DESC LIMIT 1')
  ).rows[0];
  await instance.db.pool.query(
    'INSERT INTO member_calendars(id,organisation_id,environment,member_id,version,timezone,daily_minutes,weekdays,business_weekdays,holidays,absences,actor_id,reason) SELECT $1,organisation_id,environment,member_id,version+1,timezone,daily_minutes,weekdays,business_weekdays,holidays,absences,actor_id,reason FROM member_calendars WHERE id=$2',
    [randomUUID(), c.id],
  );
  await expect(
    lifecycle().resume(coordinator.token, coordinator.csrf, client, active, p.id),
  ).rejects.toMatchObject({ code: 'preview_stale' });
  expect((await state()).status).toBe('paused');
  const next = await lifecycle().preview(
    coordinator.token,
    coordinator.csrf,
    client,
    active,
    v.version,
    0,
    reason,
  );
  await lifecycle().resume(coordinator.token, coordinator.csrf, client, active, next.id);
});
it('completion rejects missing required approved evidence and rolls back all effects', async () => {
  const v = await state();
  await expect(
    lifecycle().complete(coordinator.token, coordinator.csrf, client, active, v.version, reason),
  ).rejects.toMatchObject({ code: 'required_evidence' });
  expect((await state()).status).toBe('active');
  expect(
    (
      await instance.db.pool.query(
        "SELECT count(*) n FROM approved_changes WHERE kind='programme.completed' AND enrolment_id=$1",
        [active],
      )
    ).rows[0].n,
  ).toBe('0');
});

it('requires sufficient on-target KPIs and completes atomically only after all evidence is approved', async () => {
  const blocks = (
    await instance.db.pool.query(
      "SELECT id FROM learning_blocks WHERE enrolment_id=$1 AND state='current' ORDER BY number",
      [active],
    )
  ).rows;
  for (const block of blocks) {
    if (block.id !== started)
      await delivery().earlyStart(
        coordinator.token,
        coordinator.csrf,
        client,
        active,
        block.id,
        'Supervised synthetic evidence collection',
      );
    const draft = await delivery().save(member.token, member.csrf, client, active, block.id, 0, 0, {
      body: 'Observed safe practice and recorded supporting evidence',
      files: [],
      answers: [],
    });
    const submitted = await delivery().submit(
      member.token,
      member.csrf,
      client,
      active,
      block.id,
      0,
      draft.version,
      randomUUID(),
    );
    const g = new LearningGrading(delivery()),
      v = await g.read(coordinator.token, client, submitted.id);
    await g.manual(
      coordinator.token,
      coordinator.csrf,
      client,
      submitted.id,
      v.submission.version,
      'approved',
      'Independently verified the submitted practice',
      {
        rubric_id: v.submission.rubric.id,
        rubric_version: v.submission.rubric.version,
        criteria: v.submission.rubric.criteria.map((c) => ({
          id: c.id,
          score: 100,
          evidence_ids: [submitted.id + ':text'],
          feedback: 'Observed evidence supports this criterion.',
          insufficient_evidence: false,
        })),
      },
    );
  }
  const v = await state(),
    before = (
      await instance.db.pool.query('SELECT count(*) n FROM kpi_snapshots WHERE enrolment_id=$1', [
        active,
      ])
    ).rows[0].n;
  await expect(
    lifecycle().complete(coordinator.token, coordinator.csrf, client, active, v.version, reason),
  ).rejects.toMatchObject({ code: 'kpi_targets' });
  expect(
    (
      await instance.db.pool.query('SELECT count(*) n FROM kpi_snapshots WHERE enrolment_id=$1', [
        active,
      ])
    ).rows[0].n,
  ).toBe(before);
  // Explicit synthetic verified metric fixtures; full manual KPI entry is tested with its later port.
  const metrics = (
    await instance.db.pool.query(
      'SELECT id FROM kpi_versions WHERE enrolment_id=$1 AND number IN (2,3)',
      [active],
    )
  ).rows;
  const actor = (await auth.context(coordinator.token)).user!;
  for (const metric of metrics)
    for (let i = 0; i < 3; i++)
      await instance.db.pool.query(
        "INSERT INTO kpi_observations(id,organisation_id,environment,enrolment_id,kpi_version_id,value,evidence_type,evidence,actor_id) VALUES($1,$2,'test',$3,$4,100,'demonstrated_competence',$5,$6)",
        [
          randomUUID(),
          client,
          active,
          metric.id,
          encrypt(JSON.stringify({ fixture: 'Verified synthetic observation' }), onboarding.key),
          actor.id,
        ],
      );
  const completed = await lifecycle().complete(
    coordinator.token,
    coordinator.csrf,
    client,
    active,
    v.version,
    'Confirmed capability against all required evidence',
  );
  expect(completed.status).toBe('completed');
  expect(
    (
      await instance.db.pool.query(
        "SELECT count(*) n FROM approved_changes WHERE kind='programme.completed' AND enrolment_id=$1",
        [active],
      )
    ).rows[0].n,
  ).toBe('1');
  expect(
    (
      await instance.db.pool.query(
        "SELECT count(*) n FROM learning_notifications WHERE kind='programme_completed' AND enrolment_id=$1",
        [active],
      )
    ).rows[0].n,
  ).toBe('1');
  await expect(
    lifecycle().complete(
      coordinator.token,
      coordinator.csrf,
      client,
      active,
      completed.version,
      reason,
    ),
  ).rejects.toMatchObject({ code: 'lifecycle_conflict' });
});
