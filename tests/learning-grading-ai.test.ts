import { AiGateway } from '../packages/domain/src/ai-gateway.js';
import { AiRegistry } from '../packages/domain/src/ai-registry.js';
import {
  mockProvider,
  ProviderFailure,
  type Provider,
} from '../packages/domain/src/ai-provider.js';
import { claim, finish } from '../packages/domain/src/outbox.js';
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
  submissions: string[] = [],
  clientAdmin: { token: string; csrf: string },
  alternate: { token: string; csrf: string },
  alternateUser: string,
  alternateMembership: string;
beforeAll(async () => {
  for (const [email, set] of [
    ['demo.1.0@example.invalid', (x: any) => (clientAdmin = x)],
    ['demo.1.1@example.invalid', (x: any) => (alternate = x)],
  ] as const) {
    const guest = await auth.context(),
      session = await auth.login(
        guest.token!,
        guest.csrf,
        email,
        'Separate demonstration password',
      );
    await tenancy.select(session.token, session.csrf, client);
    set(session);
  }
  alternateUser = (await auth.context(alternate.token)).user!.id;
  alternateMembership = (
    await instance.db.pool.query(
      'SELECT id FROM client_memberships WHERE user_id=$1 AND organisation_id=$2',
      [alternateUser, client],
    )
  ).rows[0].id;
  const a = await prepare();
  active = a.id;
  const version = await fill(a);
  await submit(active, version);
  await approve(active, version);
  const e = (await delivery().read(coordinator.token, client, active)).enrolment;
  await delivery().activate(coordinator.token, coordinator.csrf, client, active, e.version, reason);
  for (const b of (await delivery().read(member.token, client, active)).blocks.slice(0, 3)) {
    await delivery().earlyStart(coordinator.token, coordinator.csrf, client, active, b.id, reason);
    await delivery().save(member.token, member.csrf, client, active, b.id, 0, 0, {
      body: 'Observed safe method with a verifiable completed checklist.',
      files: [],
      answers: [],
    });
    submissions.push(
      (await delivery().submit(member.token, member.csrf, client, active, b.id, 0, 1, randomUUID()))
        .id,
    );
  }
});
async function result(id: string, score = 80, insufficient = false) {
  const v = await grading().read(coordinator.token, client, id);
  return {
    rubric_id: v.submission.rubric.id,
    rubric_version: v.submission.rubric.version,
    criteria: v.submission.rubric.criteria.map((c) => ({
      id: c.id,
      score,
      evidence_ids: [id + ':text'],
      feedback: 'Observed safe method supported by the submitted evidence.',
      insufficient_evidence: insufficient,
    })),
  };
}
async function decide(
  id: string,
  score = 80,
  outcome = 'approved',
  actor = coordinator,
  expected?: number,
) {
  const r = await result(id, score);
  const v = expected ?? (await grading().read(actor.token, client, id)).submission.version;
  return grading().manual(
    actor.token,
    actor.csrf,
    client,
    id,
    v,
    outcome,
    'Independently reviewed the submitted evidence',
    r,
  );
}

function ai(provider: Provider = mockProvider) {
  const gateway = new AiGateway(new AiRegistry(enrolments), onboarding.key, { mock: provider });
  return { gateway, service: new LearningGrading(delivery(), gateway) };
}
async function run(gateway: AiGateway) {
  const job = await claim(instance.db, ['ai.task']);
  expect(job?.kind).toBe('ai.task');
  await gateway.process(job!);
  await finish(instance.db, job!, 'done');
}
it('persists provisional mock grading privately and requires separate exact human approval', async () => {
  const id = submissions[0],
    { gateway, service } = ai(),
    requested = await service.request(
      coordinator.token,
      coordinator.csrf,
      client,
      id,
      1,
      'Evaluate only the submitted evidence',
    );
  expect(requested.status).toBe('queued');
  await expect(
    service.manual(
      coordinator.token,
      coordinator.csrf,
      client,
      id,
      requested.version,
      'approved',
      reason,
      await result(id),
    ),
  ).rejects.toMatchObject({ code: 'grade_pending' });
  await run(gateway);
  const privateView = await service.read(coordinator.token, client, id);
  expect(privateView.grades[0].status).toBe('provisional');
  expect(privateView.grades[0].total).toBe(70);
  const publicView = await service.read(member.token, client, id);
  expect(publicView.grades).toHaveLength(0);
  expect(publicView.approved).toBeNull();
  expect(publicView.submission.status).toBe('review_pending');
  expect((await instance.db.pool.query('SELECT * FROM kpi_observations')).rows).toHaveLength(0);
  await expect(
    service.decide(
      coordinator.token,
      coordinator.csrf,
      client,
      id,
      requested.id,
      requested.version,
      'approved',
      reason,
    ),
  ).rejects.toMatchObject({ code: 'grade_conflict' });
  await service.decide(
    coordinator.token,
    coordinator.csrf,
    client,
    id,
    requested.id,
    privateView.submission.version,
    'approved',
    'Independently checked the supporting evidence',
  );
  expect((await service.read(member.token, client, id)).approved?.total).toBe(70);
});
it('withdrawal during provider work prevents provisional application but retains accounted cost', async () => {
  const id = submissions[1];
  let calls = 0;
  const { gateway, service } = ai(async (profile, input) => {
    calls++;
    const v = await grading().read(member.token, client, id);
    await delivery().withdraw(
      member.token,
      member.csrf,
      client,
      active,
      id,
      v.submission.version,
      'Withdraw work while grading is in flight',
    );
    return mockProvider(profile, input);
  });
  await service.request(
    coordinator.token,
    coordinator.csrf,
    client,
    id,
    1,
    'Evaluate the current submission',
  );
  await run(gateway);
  const view = await service.read(member.token, client, id);
  expect(view.submission.status).toBe('withdrawn');
  expect(view.approved).toBeNull();
  expect(calls).toBe(1);
  const ledger = (
    await instance.db.pool.query(
      'SELECT * FROM ai_runs WHERE subject_id IN(SELECT id FROM grade_attempts WHERE submission_attempt_id=$1)',
      [id],
    )
  ).rows[0];
  expect(Number(ledger.spent)).toBeGreaterThan(0);
  expect(ledger.status).toBe('failed');
});
it('retains ambiguous reservation and allows a supported human decision without retrying the provider', async () => {
  const id = submissions[2];
  let calls = 0;
  const { gateway, service } = ai(async () => {
    calls++;
    throw new ProviderFailure('ambiguous');
  });
  await service.request(
    coordinator.token,
    coordinator.csrf,
    client,
    id,
    1,
    'Evaluate submitted work provisionally',
  );
  await run(gateway);
  const v = await service.read(coordinator.token, client, id);
  expect(v.grades[0].status).toBe('technical_failure');
  expect(v.submission.status).toBe('technical_failure');
  const ledger = (
    await instance.db.pool.query('SELECT * FROM ai_runs WHERE subject_id=$1', [v.grades[0].id])
  ).rows[0];
  expect(ledger.status).toBe('ambiguous');
  expect(Number(ledger.reserved)).toBeGreaterThan(0);
  await service.manual(
    coordinator.token,
    coordinator.csrf,
    client,
    id,
    v.submission.version,
    'approved',
    'Human assessment without retrying the provider',
    await result(id, 85),
  );
  expect(calls).toBe(1);
  expect((await service.read(member.token, client, id)).approved?.total).toBe(85);
});
it('uses pinned quiz answers without an AI run and refuses to approve an unanswered criterion', async () => {
  const b = (await delivery().read(coordinator.token, client, active)).blocks[3];
  await delivery().publishQuiz(
    coordinator.token,
    coordinator.csrf,
    client,
    active,
    b.id,
    0,
    [
      { prompt: 'Which action is safe?', options: ['Check', 'Guess'], correct: 0 },
      { prompt: 'Which evidence is reliable?', options: ['Record', 'Guess'], correct: 0 },
    ],
    reason,
  );
  await delivery().earlyStart(coordinator.token, coordinator.csrf, client, active, b.id, reason);
  await delivery().save(member.token, member.csrf, client, active, b.id, 0, 0, {
    body: '',
    files: [],
    answers: [0, null],
  });
  const submitted = await delivery().submit(
    member.token,
    member.csrf,
    client,
    active,
    b.id,
    0,
    1,
    randomUUID(),
  );
  const before = (await instance.db.pool.query('SELECT count(*) n FROM ai_runs')).rows[0].n;
  const requested = await grading().request(
    coordinator.token,
    coordinator.csrf,
    client,
    submitted.id,
    1,
    'Run deterministic answer-key comparison',
  );
  expect(requested.runId).toBeNull();
  expect(requested.status).toBe('provisional');
  const view = await grading().read(coordinator.token, client, submitted.id);
  expect(view.grades[0].total).toBeNull();
  expect(view.grades[0].result?.criteria.map((c) => c.score)).toEqual([100, 0]);
  expect((await instance.db.pool.query('SELECT count(*) n FROM ai_runs')).rows[0].n).toBe(before);
  await expect(
    grading().decide(
      coordinator.token,
      coordinator.csrf,
      client,
      submitted.id,
      requested.id,
      requested.version,
      'approved',
      reason,
    ),
  ).rejects.toMatchObject({ code: 'grade_insufficient' });
  await grading().decide(
    coordinator.token,
    coordinator.csrf,
    client,
    submitted.id,
    requested.id,
    requested.version,
    'changes_requested',
    'Please provide the missing second answer',
  );
  const memberView = await grading().read(member.token, client, submitted.id);
  expect(memberView.approved).toBeNull();
  expect(memberView.changes?.result.criteria[1].insufficient_evidence).toBe(true);
  expect(JSON.stringify(memberView)).not.toContain('answer_key');
});
