import { LearningSupport } from '../packages/domain/src/learning-support.js';
import { LearningLifecycle } from '../packages/domain/src/learning-lifecycle.js';
import { AiGateway } from '../packages/domain/src/ai-gateway.js';
import { AiRegistry } from '../packages/domain/src/ai-registry.js';
import {
  mockProvider,
  ProviderFailure,
  type Provider,
} from '../packages/domain/src/ai-provider.js';
import { claim, finish } from '../packages/domain/src/outbox.js';
import { LearningGrading } from '../packages/domain/src/learning-grading.js';
import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { testDatabase } from './helpers.js';
import { Auth } from '../packages/domain/src/auth.js';
import { Tenancy } from '../packages/domain/src/tenancy.js';
import { Enrolments } from '../packages/domain/src/enrolments.js';
import { Onboarding } from '../packages/domain/src/onboarding.js';
import { LearningPlans } from '../packages/domain/src/learning-plans.js';
import { Delivery } from '../packages/domain/src/delivery.js';
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
  grading = () => new LearningGrading(delivery());
let active: string,
  submission: string,
  target: string,
  approvedProposal: string,
  firstGrade: string;
function ai(provider: Provider = mockProvider) {
  const gateway = new AiGateway(new AiRegistry(enrolments), onboarding.key, { mock: provider });
  return { gateway, support: new LearningSupport(delivery(), gateway) };
}
async function run(gateway: AiGateway) {
  const job = await claim(instance.db, ['ai.task']);
  expect(job?.kind).toBe('ai.task');
  await gateway.process(job!);
  await finish(instance.db, job!, 'done');
}
async function grade(score: number) {
  const v = await grading().read(coordinator.token, client, submission);
  return grading().manual(
    coordinator.token,
    coordinator.csrf,
    client,
    submission,
    v.submission.version,
    'approved',
    'Independently verified the submitted evidence',
    {
      rubric_id: v.submission.rubric.id,
      rubric_version: v.submission.rubric.version,
      criteria: v.submission.rubric.criteria.map((c) => ({
        id: c.id,
        score,
        evidence_ids: [submission + ':text'],
        feedback: 'Observed method supports the required criterion.',
        insufficient_evidence: false,
      })),
    },
  );
}
beforeAll(async () => {
  const a = await prepare('2027-01-11');
  active = a.id;
  const version = await fill(a);
  await submit(active, version);
  await approve(active, version);
  const e = (await delivery().read(coordinator.token, client, active)).enrolment;
  await delivery().activate(coordinator.token, coordinator.csrf, client, active, e.version, reason);
  const blocks = (await delivery().read(member.token, client, active)).blocks;
  target = blocks[2].id;
  await delivery().publishQuiz(
    coordinator.token,
    coordinator.csrf,
    client,
    active,
    target,
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
    blocks[0].id,
    reason,
  );
  await delivery().save(member.token, member.csrf, client, active, blocks[0].id, 0, 0, {
    body: 'Observed safe method with verifiable recorded evidence.',
    files: [],
    answers: [],
  });
  submission = (
    await delivery().submit(
      member.token,
      member.csrf,
      client,
      active,
      blocks[0].id,
      0,
      1,
      randomUUID(),
    )
  ).id;
  firstGrade = (await grade(80)).gradeId;
});
it('selects N+2, keeps mock output provisional and requires exact current human approval', async () => {
  const { gateway, support } = ai();
  await expect(
    support.propose(member.token, member.csrf, client, active, 1, reason),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    support.propose(coordinator.token, coordinator.csrf, client, active, 2, reason),
  ).rejects.toMatchObject({ code: 'approved_sources' });
  const requested = await support.propose(
    coordinator.token,
    coordinator.csrf,
    client,
    active,
    1,
    reason,
  );
  approvedProposal = requested.id;
  expect(requested.targetNumber).toBe(3);
  await expect(
    support.approve(
      coordinator.token,
      coordinator.csrf,
      client,
      active,
      requested.id,
      target,
      reason,
    ),
  ).rejects.toMatchObject({ code: 'proposal_stale' });
  await run(gateway);
  let view = await support.read(coordinator.token, client, active);
  expect(view.proposals[0].status).toBe('provisional');
  expect(view.proposals[0].sourceIds).toEqual([firstGrade]);
  expect((await support.read(member.token, client, active)).proposals).toEqual([]);
  await expect(
    support.approve(
      coordinator.token,
      coordinator.csrf,
      client,
      active,
      requested.id,
      randomUUID(),
      reason,
    ),
  ).rejects.toMatchObject({ code: 'proposal_stale' });
  const original = (await delivery().lesson(coordinator.token, client, active, target, 0)).quiz;
  const approved = await support.approve(
    coordinator.token,
    coordinator.csrf,
    client,
    active,
    requested.id,
    target,
    reason,
  );
  expect(approved.version).toBe(2);
  expect((await support.read(member.token, client, active)).proposals[0].status).toBe('approved');
  const next = await delivery().lesson(member.token, client, active, approved.id, 0);
  expect(next.quiz?.questions).toEqual(original?.questions);
  expect(next.quiz?.id).not.toBe(original?.id);
  expect(JSON.stringify(next)).not.toContain('answer_key');
  expect(
    (await instance.db.pool.query('SELECT state FROM learning_blocks WHERE id=$1', [target]))
      .rows[0].state,
  ).toBe('superseded');
  await expect(
    support.approve(
      coordinator.token,
      coordinator.csrf,
      client,
      active,
      requested.id,
      target,
      reason,
    ),
  ).rejects.toMatchObject({ code: 'proposal_stale' });
  await expect(
    instance.db.pool.query(
      'UPDATE adaptation_proposals SET approved_by=NULL,approved_at=NULL WHERE id=$1',
      [requested.id],
    ),
  ).rejects.toBeDefined();
  target = approved.id;
});
it('atomically invalidates pending proposals and flags approved support after a source regrade', async () => {
  const { gateway, support } = ai();
  const provisional = await support.propose(
    coordinator.token,
    coordinator.csrf,
    client,
    active,
    1,
    reason,
  );
  await run(gateway);
  const queued = await support.propose(
    coordinator.token,
    coordinator.csrf,
    client,
    active,
    1,
    reason,
  );
  await grade(90);
  const view = await support.read(coordinator.token, client, active);
  expect(view.proposals.find((p) => p.id === approvedProposal)?.status).toBe(
    'source_review_required',
  );
  expect(view.proposals.find((p) => p.id === provisional.id)?.status).toBe('stale');
  expect(view.proposals.find((p) => p.id === queued.id)?.status).toBe('stale');
  expect(
    (await instance.db.pool.query('SELECT state FROM learning_blocks WHERE id=$1', [target]))
      .rows[0].state,
  ).toBe('current');
  expect(
    (
      await instance.db.pool.query(
        "SELECT count(*) n FROM learning_notifications WHERE enrolment_id=$1 AND kind='source_review_required'",
        [active],
      )
    ).rows[0].n,
  ).toBe('3');
  await run(gateway);
  expect(
    (await support.read(coordinator.token, client, active)).proposals.find(
      (p) => p.id === queued.id,
    )?.status,
  ).toBe('stale');
  await expect(
    support.approve(
      coordinator.token,
      coordinator.csrf,
      client,
      active,
      provisional.id,
      target,
      reason,
    ),
  ).rejects.toMatchObject({ code: 'proposal_stale' });
});
it('resumption invalidates a pending proposal and preserves approved history', async () => {
  const { gateway, support } = ai();
  const request = await support.propose(
    coordinator.token,
    coordinator.csrf,
    client,
    active,
    1,
    reason,
  );
  await run(gateway);
  const lifecycle = new LearningLifecycle(delivery()),
    v = await lifecycle.read(coordinator.token, client, active);
  await lifecycle.pause(coordinator.token, coordinator.csrf, client, active, v.version, reason);
  const p = await lifecycle.preview(
    coordinator.token,
    coordinator.csrf,
    client,
    active,
    v.version + 1,
    0,
    reason,
  );
  await lifecycle.resume(coordinator.token, coordinator.csrf, client, active, p.id);
  expect(
    (await support.read(coordinator.token, client, active)).proposals.find(
      (p) => p.id === request.id,
    )?.status,
  ).toBe('stale');
  await expect(
    support.approve(
      coordinator.token,
      coordinator.csrf,
      client,
      active,
      request.id,
      target,
      reason,
    ),
  ).rejects.toMatchObject({ code: 'proposal_stale' });
});
it('keeps KPI support provisional, pinned to immutable snapshots and private to coordinators', async () => {
  const { gateway, support } = ai();
  const before = (
    await instance.db.pool.query(
      'SELECT definition FROM kpi_versions WHERE enrolment_id=$1 ORDER BY number',
      [active],
    )
  ).rows;
  const requested = await support.suggest(coordinator.token, coordinator.csrf, client, active);
  await run(gateway);
  const view = await support.read(coordinator.token, client, active);
  expect(view.suggestions[0].id).toBe(requested.id);
  expect(view.suggestions[0].status).toBe('provisional');
  expect(view.suggestions[0].sourceIds).toHaveLength(3);
  expect(view.suggestions[0].actions).toHaveLength(2);
  expect((await support.read(member.token, client, active)).suggestions).toEqual([]);
  expect(
    (
      await instance.db.pool.query(
        'SELECT definition FROM kpi_versions WHERE enrolment_id=$1 ORDER BY number',
        [active],
      )
    ).rows,
  ).toEqual(before);
});
it('retains ambiguous reservations without a usable suggestion', async () => {
  const { gateway, support } = ai(async () => {
    throw new ProviderFailure('ambiguous');
  });
  const request = await support.suggest(coordinator.token, coordinator.csrf, client, active);
  await run(gateway);
  const v = (await support.read(coordinator.token, client, active)).suggestions.find(
    (s) => s.id === request.id,
  )!;
  expect(v.status).toBe('ambiguous');
  expect(v.actions).toEqual([]);
  const runState = (
    await instance.db.pool.query('SELECT reserved,status FROM ai_runs WHERE id=$1', [request.runId])
  ).rows[0];
  expect(Number(runState.reserved)).toBeGreaterThan(0);
  expect(runState.status).toBe('ambiguous');
});

it('checks the exact freeze boundary and refuses a target started during provider work', async () => {
  const blocks = (await delivery().read(coordinator.token, client, active)).blocks;
  const candidate = blocks.find((b) => b.number === 3)!;
  const b = await instance.db.transaction((sql) =>
    delivery().block(
      sql,
      { id: active, organisation_id: client, environment: 'test' } as any,
      candidate.id,
    ),
  );
  const cutoff = Date.parse(candidate.content.freeze_at);
  const clock = vi.spyOn(Date, 'now').mockReturnValue(cutoff);
  try {
    expect(
      await instance.db.transaction((sql) => new LearningSupport(delivery()).eligible(sql, b)),
    ).toBe(false);
    clock.mockReturnValue(cutoff - 1);
    expect(
      await instance.db.transaction((sql) => new LearningSupport(delivery()).eligible(sql, b)),
    ).toBe(true);
  } finally {
    clock.mockRestore();
  }
  const { gateway, support } = ai(async (profile, input, signal) => {
    await delivery().earlyStart(
      coordinator.token,
      coordinator.csrf,
      client,
      active,
      candidate.id,
      reason,
    );
    return mockProvider(profile, input, signal);
  });
  const request = await support.propose(
    coordinator.token,
    coordinator.csrf,
    client,
    active,
    1,
    reason,
  );
  await run(gateway);
  expect(
    (await support.read(coordinator.token, client, active)).proposals.find(
      (p) => p.id === request.id,
    )?.status,
  ).toBe('failed');
  const result = (
    await instance.db.pool.query('SELECT spent,status FROM ai_runs WHERE id=$1', [request.runId])
  ).rows[0];
  expect(Number(result.spent)).toBeGreaterThan(0);
  expect(result.status).toBe('failed');
});
it('returns final support without a provider call when no future block is eligible', async () => {
  const { support } = ai();
  const blocks = (await delivery().read(coordinator.token, client, active)).blocks.filter(
    (b) => b.number >= 3 && !b.startedAt,
  );
  for (const b of blocks)
    await delivery().earlyStart(coordinator.token, coordinator.csrf, client, active, b.id, reason);
  const result = await support.propose(
    coordinator.token,
    coordinator.csrf,
    client,
    active,
    1,
    reason,
  );
  expect(result.status).toBe('final_support');
  expect(result.runId).toBeNull();
});

it('rechecks revoked authority after provider work and keeps the known charge without applying output', async () => {
  const { gateway, support } = ai(async (profile, input, signal) => {
    await instance.db.pool.query('UPDATE coordinator_allocations SET ends_at=now() WHERE id=$1', [
      allocation,
    ]);
    return mockProvider(profile, input, signal);
  });
  const request = await support.suggest(coordinator.token, coordinator.csrf, client, active);
  await run(gateway);
  const result = (
    await instance.db.pool.query('SELECT actions,status FROM kpi_suggestions WHERE id=$1', [
      request.id,
    ])
  ).rows[0];
  expect(result.status).toBe('failed');
  expect(result.actions).toBeNull();
  expect(
    Number(
      (await instance.db.pool.query('SELECT spent FROM ai_runs WHERE id=$1', [request.runId]))
        .rows[0].spent,
    ),
  ).toBeGreaterThan(0);
});
