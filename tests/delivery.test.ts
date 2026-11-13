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

const delivery = () => new Delivery(service());
let active: string, first: string, second: string;
const quiz = [
  { prompt: 'Which method is safe?', options: ['Observe first', 'Skip checks'], correct: 0 },
  {
    prompt: 'Which evidence is useful?',
    options: ['Guesswork', 'Observed demonstration'],
    correct: 1,
  },
];
it('activates only an exact approved enrolment and atomically pins blocks, measures and notice', async () => {
  const a = await prepare();
  active = a.id;
  await expect(
    delivery().activate(coordinator.token, coordinator.csrf, client, active, 1, reason),
  ).rejects.toMatchObject({ code: 'activation_conflict' });
  const version = await fill(a);
  await submit(active, version);
  await approve(active, version);
  const e = (await delivery().read(coordinator.token, client, active)).enrolment;
  await expect(
    delivery().activate(member.token, member.csrf, client, active, e.version, reason),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    delivery().activate(coordinator.token, coordinator.csrf, client, active, e.version - 1, reason),
  ).rejects.toMatchObject({ code: 'activation_conflict' });
  await delivery().activate(coordinator.token, coordinator.csrf, client, active, e.version, reason);
  const view = await delivery().read(member.token, client, active);
  expect(view.enrolment.status).toBe('active');
  expect(view.blocks).toHaveLength(4);
  first = view.blocks[0].id;
  second = view.blocks[1].id;
  expect(
    (await instance.db.pool.query('SELECT * FROM kpi_versions WHERE enrolment_id=$1', [active]))
      .rows,
  ).toHaveLength(3);
  expect(
    (
      await instance.db.pool.query('SELECT * FROM learning_notifications WHERE enrolment_id=$1', [
        active,
      ])
    ).rows,
  ).toHaveLength(1);
  await expect(
    delivery().activate(coordinator.token, coordinator.csrf, client, active, e.version, reason),
  ).rejects.toMatchObject({ code: 'activation_conflict' });
  await expect(delivery().read(admin.token, client, active)).rejects.toMatchObject({ status: 404 });
  await expect(delivery().read(coordinator.token, other, active)).rejects.toMatchObject({
    status: 403,
  });
});
it('previews future lessons and publishes immutable quizzes without exposing answer keys', async () => {
  const view = await delivery().lesson(member.token, client, active, first, 0);
  expect(view.editable).toBe(false);
  expect(view.draft.version).toBe(0);
  await expect(
    delivery().save(member.token, member.csrf, client, active, first, 0, 0, {
      body: 'Practice',
      files: [],
      answers: [],
    }),
  ).rejects.toMatchObject({ code: 'future_lesson' });
  await expect(
    delivery().publishQuiz(member.token, member.csrf, client, active, first, 0, quiz, reason),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    delivery().publishQuiz(
      coordinator.token,
      coordinator.csrf,
      client,
      active,
      first,
      0,
      [{ ...quiz[0], correct: 3 }, quiz[1]],
      reason,
    ),
  ).rejects.toMatchObject({ code: 'quiz_answer' });
  await delivery().publishQuiz(
    coordinator.token,
    coordinator.csrf,
    client,
    active,
    first,
    0,
    quiz,
    reason,
  );
  await expect(
    delivery().publishQuiz(
      coordinator.token,
      coordinator.csrf,
      client,
      active,
      first,
      0,
      quiz,
      reason,
    ),
  ).rejects.toMatchObject({ code: 'quiz_published' });
  const publicView = await delivery().lesson(member.token, client, active, first, 0);
  expect(publicView.quiz?.questions).toHaveLength(2);
  expect(JSON.stringify(publicView)).not.toContain('answer_key');
  expect(JSON.stringify(publicView.quiz)).not.toContain('correct');
  await expect(
    instance.db.pool.query(
      "UPDATE objective_quizzes SET answer_key='forged' WHERE learning_block_id=$1",
      [first],
    ),
  ).rejects.toThrow();
  await expect(
    instance.db.pool.query("UPDATE learning_blocks SET content='forged' WHERE id=$1", [first]),
  ).rejects.toThrow();
});
it('requires reasoned early start and protects member drafts from stale writes and coordinator access', async () => {
  await expect(
    delivery().earlyStart(member.token, member.csrf, client, active, first, reason),
  ).rejects.toMatchObject({ status: 403 });
  await delivery().earlyStart(coordinator.token, coordinator.csrf, client, active, first, reason);
  await expect(
    delivery().earlyStart(coordinator.token, coordinator.csrf, client, active, first, reason),
  ).rejects.toMatchObject({ code: 'early_start_conflict' });
  await expect(
    delivery().publishQuiz(
      coordinator.token,
      coordinator.csrf,
      client,
      active,
      first,
      1,
      quiz,
      reason,
    ),
  ).rejects.toMatchObject({ code: 'quiz_frozen' });
  await expect(
    delivery().save(coordinator.token, coordinator.csrf, client, active, first, 0, 0, {
      body: 'forged',
      files: [],
      answers: [],
    }),
  ).rejects.toMatchObject({ code: 'member_required' });
  await delivery().save(member.token, member.csrf, client, active, first, 0, 0, {
    body: 'Private member draft',
    files: [],
    answers: [0, null],
  });
  await expect(
    delivery().save(member.token, member.csrf, client, active, first, 0, 0, {
      body: 'stale',
      files: [],
      answers: [],
    }),
  ).rejects.toMatchObject({ code: 'work_conflict' });
  expect((await delivery().lesson(member.token, client, active, first, 0)).draft.body).toBe(
    'Private member draft',
  );
  expect((await delivery().lesson(coordinator.token, client, active, first, 0)).draft.body).toBe(
    '',
  );
  const stored = (
    await instance.db.pool.query('SELECT payload FROM work_drafts WHERE learning_block_id=$1', [
      first,
    ])
  ).rows[0];
  expect(stored.payload).not.toContain('Private member draft');
  await expect(
    delivery().save(member.token, member.csrf, client, active, first, 0, 1, {
      body: 'test',
      files: [randomUUID()],
      answers: [],
    }),
  ).rejects.toMatchObject({ code: 'invalid_evidence' });
});
it('pins zero-index answers and rubrics into idempotent immutable attempts', async () => {
  await delivery().save(member.token, member.csrf, client, active, first, 0, 1, {
    body: '',
    files: [],
    answers: [0, null],
  });
  const key = randomUUID();
  await expect(
    delivery().submit(member.token, member.csrf, client, active, first, 0, 1, key),
  ).rejects.toMatchObject({ code: 'save_required' });
  const receipt = await delivery().submit(
    member.token,
    member.csrf,
    client,
    active,
    first,
    0,
    2,
    key,
  );
  expect(
    await delivery().submit(member.token, member.csrf, client, active, first, 0, 2, key),
  ).toEqual(receipt);
  await expect(
    delivery().submit(member.token, member.csrf, client, active, first, 0, 1, key),
  ).rejects.toMatchObject({ code: 'submission_idempotency' });
  await expect(
    delivery().submit(member.token, member.csrf, client, active, first, 0, 2, randomUUID()),
  ).rejects.toMatchObject({ code: 'submission_pending' });
  const raw = (
    await instance.db.pool.query('SELECT * FROM submission_attempts WHERE id=$1', [receipt.id])
  ).rows[0];
  const pinned = delivery().submitted(raw);
  expect(pinned.quiz_snapshot?.answer_key).toEqual({ '0': 0, '1': 1 });
  expect(pinned.answers).toEqual([0, null]);
  expect(digest(JSON.stringify(pinned))).toBe(receipt.contentHash);
  const publicReceipt = await delivery().receipt(member.token, client, active, receipt.id);
  expect(JSON.stringify(publicReceipt)).not.toContain('answer_key');
  await delivery().save(member.token, member.csrf, client, active, first, 0, 2, {
    body: 'New draft after submission',
    files: [],
    answers: [1, 1],
  });
  expect((await delivery().receipt(member.token, client, active, receipt.id)).submission.body).toBe(
    '',
  );
  await expect(
    instance.db.pool.query("UPDATE submission_attempts SET payload='forged' WHERE id=$1", [
      receipt.id,
    ]),
  ).rejects.toThrow();
  expect(
    (
      await instance.db.pool.query(
        "SELECT * FROM learning_notifications WHERE enrolment_id=$1 AND kind='review_needed'",
        [active],
      )
    ).rows,
  ).toHaveLength(1);
  await expect(
    delivery().withdraw(coordinator.token, coordinator.csrf, client, active, receipt.id, 1, reason),
  ).rejects.toMatchObject({ code: 'withdraw_forbidden' });
  await expect(
    delivery().withdraw(member.token, member.csrf, client, active, receipt.id, 2, reason),
  ).rejects.toMatchObject({ code: 'withdraw_conflict' });
  await delivery().withdraw(member.token, member.csrf, client, active, receipt.id, 1, reason);
  expect((await delivery().receipt(member.token, client, active, receipt.id)).canWithdraw).toBe(
    false,
  );
  const next = await delivery().submit(
    member.token,
    member.csrf,
    client,
    active,
    first,
    0,
    3,
    randomUUID(),
  );
  expect(next.attempt).toBe(2);
  expect(next.id).not.toBe(receipt.id);
});
it('rechecks evidence scan state at submission and rejects evidence from another enrolment', async () => {
  const file = randomUUID(),
    user = (await auth.context(member.token)).user!.id;
  await instance.db.pool.query(
    "INSERT INTO evidence_files(id,organisation_id,environment,enrolment_id,uploaded_by,storage_key,original_name,mime,bytes,sha256,scan_status,sensitive,purpose) VALUES($1::uuid,$2,'test',$3,$4,$1::text,'evidence.txt','text/plain',5,'synthetic fixture','clean',false,'evidence')",
    [file, client, active, user],
  );
  const foreign = randomUUID();
  await instance.db.pool.query(
    "INSERT INTO evidence_files(id,organisation_id,environment,enrolment_id,uploaded_by,storage_key,original_name,mime,bytes,sha256,scan_status,sensitive,purpose) VALUES($1::uuid,$2,'test',$3,$4,$1::text,'other.txt','text/plain',5,'synthetic fixture','clean',false,'evidence')",
    [foreign, client, record, user],
  );
  await expect(
    delivery().save(member.token, member.csrf, client, active, first, 0, 3, {
      body: '',
      files: [foreign],
      answers: [],
    }),
  ).rejects.toMatchObject({ code: 'invalid_evidence' });
  await delivery().save(member.token, member.csrf, client, active, first, 0, 3, {
    body: 'Newer clean evidence draft',
    files: [file],
    answers: [],
  });
  const attempts = (
    await instance.db.pool.query(
      'SELECT id,version FROM submission_attempts WHERE learning_block_id=$1 ORDER BY attempt DESC',
      [first],
    )
  ).rows;
  await delivery().withdraw(
    member.token,
    member.csrf,
    client,
    active,
    attempts[0].id,
    attempts[0].version,
    reason,
  );
  await instance.db.pool.query("UPDATE evidence_files SET scan_status='rejected' WHERE id=$1", [
    file,
  ]);
  await expect(
    delivery().submit(member.token, member.csrf, client, active, first, 0, 4, randomUUID()),
  ).rejects.toMatchObject({ code: 'invalid_evidence' });
  expect((await delivery().lesson(member.token, client, active, first, 0)).files).toHaveLength(0);
});
it('rejects empty work, wrong lesson and access after sensitive grant revocation', async () => {
  await delivery().earlyStart(coordinator.token, coordinator.csrf, client, active, second, reason);
  await delivery().save(member.token, member.csrf, client, active, second, 0, 0, {
    body: '  ',
    files: [],
    answers: [null],
  });
  await expect(
    delivery().submit(member.token, member.csrf, client, active, second, 0, 1, randomUUID()),
  ).rejects.toMatchObject({ code: 'work_required' });
  await expect(delivery().lesson(member.token, client, active, first, 99)).rejects.toMatchObject({
    code: 'lesson_unavailable',
  });
  await instance.db.pool.query(
    'UPDATE client_sensitive_grants SET ends_at=now() WHERE allocation_id=$1',
    [allocation],
  );
  await expect(
    delivery().lesson(coordinator.token, client, active, first, 0),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    delivery().earlyStart(coordinator.token, coordinator.csrf, client, active, second, reason),
  ).rejects.toMatchObject({ status: 404 });
  expect((await delivery().lesson(member.token, client, active, first, 0)).draft.body).toBe(
    'Newer clean evidence draft',
  );
});
