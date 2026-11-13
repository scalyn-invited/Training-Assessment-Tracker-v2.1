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
let attachedFile: string;
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
  attachedFile = randomUUID();
  await instance.db.pool.query(
    "INSERT INTO evidence_files(id,organisation_id,environment,enrolment_id,uploaded_by,storage_key,original_name,mime,bytes,sha256,scan_status,sensitive,purpose) SELECT $1::uuid,e.organisation_id,e.environment,e.id,e.member_id,$1::text,'Pinned learning evidence.txt','text/plain',5,'synthetic fixture','clean',false,'evidence' FROM enrolments e WHERE e.id=$2",
    [attachedFile, active],
  );
  for (const b of (await delivery().read(member.token, client, active)).blocks.slice(0, 3)) {
    await delivery().earlyStart(coordinator.token, coordinator.csrf, client, active, b.id, reason);
    await delivery().save(member.token, member.csrf, client, active, b.id, 0, 0, {
      body: 'Observed safe method with a verifiable completed checklist.',
      files: submissions.length === 0 ? [attachedFile] : [],
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
it('requires current reviewer authority, exact version and sufficient evidence for approval', async () => {
  const id = submissions[0],
    r = await result(id);
  await expect(
    grading().manual(member.token, member.csrf, client, id, 1, 'approved', reason, r),
  ).rejects.toMatchObject({ status: 403 });
  await expect(grading().read(admin.token, client, id)).rejects.toMatchObject({ status: 404 });
  await expect(grading().read(coordinator.token, other, id)).rejects.toMatchObject({ status: 403 });
  await expect(
    grading().manual(coordinator.token, coordinator.csrf, client, id, 2, 'approved', reason, r),
  ).rejects.toMatchObject({ code: 'grade_conflict' });
  await expect(
    grading().manual(
      coordinator.token,
      coordinator.csrf,
      client,
      id,
      1,
      'approved',
      reason,
      await result(id, 0, true),
    ),
  ).rejects.toMatchObject({ code: 'grade_insufficient' });
  expect((await instance.db.pool.query('SELECT * FROM grade_attempts')).rows).toHaveLength(0);
  const approved = await decide(id);
  expect(approved.total).toBe(80);
  const memberView = await grading().read(member.token, client, id);
  expect(memberView.approved?.total).toBe(80);
  expect(memberView.grades).toHaveLength(0);
  expect(memberView.canWithdraw).toBe(false);
  await expect(
    grading().manual(coordinator.token, coordinator.csrf, client, id, 1, 'approved', reason, r),
  ).rejects.toMatchObject({ code: 'grade_conflict' });
  const snapshot = (
    await instance.db.pool.query('SELECT * FROM kpi_snapshots WHERE enrolment_id=$1', [active])
  ).rows[0];
  expect(snapshot.status).toBe('insufficient_evidence');
  expect(snapshot.value).toBeNull();
  expect(snapshot.sample_count).toBe(1);
  await expect(
    instance.db.pool.query("UPDATE grade_decisions SET scores='forged' WHERE id=$1", [approved.id]),
  ).rejects.toThrow('immutable');
  await expect(
    instance.db.pool.query("UPDATE grade_attempts SET result='forged' WHERE id=$1", [
      approved.gradeId,
    ]),
  ).rejects.toThrow('immutable');
});
it('preserves approved feedback while a later human review requests changes, then replaces evidence on regrade', async () => {
  const id = submissions[0];
  await decide(id, 30, 'changes_requested');
  const unchanged = await grading().read(member.token, client, id);
  expect(unchanged.approved?.total).toBe(80);
  expect(unchanged.changes?.total).toBe(30);
  expect(unchanged.submission.status).toBe('approved');
  await decide(id, 90);
  const view = await grading().read(coordinator.token, client, id);
  expect(view.grades.map((g) => g.status)).toEqual(['approved', 'changes_requested', 'superseded']);
  expect(view.approved?.total).toBe(90);
  const observations = (
    await instance.db.pool.query(
      'SELECT current,value FROM kpi_observations WHERE submission_attempt_id=$1 ORDER BY created_at',
      [id],
    )
  ).rows;
  expect(observations.map((r) => r.current)).toEqual([false, true]);
  expect(Number(observations[1].value)).toBe(90);
  expect(
    (await instance.db.pool.query('SELECT * FROM kpi_snapshots WHERE enrolment_id=$1', [active]))
      .rows,
  ).toHaveLength(2);
});
it('records only comparable approved grades with immutable snapshot lineage and approved feed events', async () => {
  await decide(submissions[1], 80);
  await decide(submissions[2], 70);
  const snapshots = (
    await instance.db.pool.query(
      'SELECT * FROM kpi_snapshots WHERE enrolment_id=$1 ORDER BY created_at DESC',
      [active],
    )
  ).rows;
  expect(snapshots[0].sample_count).toBe(3);
  expect(Number(snapshots[0].value)).toBe(80);
  expect(snapshots[0].status).toBe('needs_support');
  expect(snapshots[0].source_ids).toHaveLength(3);
  await expect(
    instance.db.pool.query('UPDATE kpi_snapshots SET value=100 WHERE id=$1', [snapshots[0].id]),
  ).rejects.toThrow('immutable');
  expect(
    (
      await instance.db.pool.query(
        "SELECT * FROM approved_changes WHERE enrolment_id=$1 AND kind='grade.approved'",
        [active],
      )
    ).rows,
  ).toHaveLength(4);
  expect(
    (
      await instance.db.pool.query(
        "SELECT * FROM learning_notifications WHERE enrolment_id=$1 AND kind='feedback_ready'",
        [active],
      )
    ).rows,
  ).toHaveLength(5);
});
it('requires an independent role-bound alternate during an appeal and closes case access when upheld', async () => {
  const id = submissions[0],
    version = (await grading().read(member.token, client, id)).submission.version,
    r = await result(id);
  const appeal = await grading().appeal(
    member.token,
    member.csrf,
    client,
    id,
    version,
    'Please reconsider the supporting evidence',
  );
  await expect(
    grading().manual(
      coordinator.token,
      coordinator.csrf,
      client,
      id,
      appeal.version,
      'approved',
      reason,
      r,
    ),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    grading().route(admin.token, admin.csrf, client, appeal.id, alternateUser, reason),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    grading().route(
      clientAdmin.token,
      clientAdmin.csrf,
      client,
      appeal.id,
      (await auth.context(coordinator.token)).user!.id,
      reason,
    ),
  ).rejects.toMatchObject({ status: 422 });
  await expect(grading().read(alternate.token, client, id)).rejects.toMatchObject({ status: 404 });
  await grading().route(
    clientAdmin.token,
    clientAdmin.csrf,
    client,
    appeal.id,
    alternateUser,
    reason,
  );
  expect((await grading().read(alternate.token, client, id)).canReview).toBe(true);
  expect((await grading().read(alternate.token, client, id)).grades).toHaveLength(0);
  expect(
    (await delivery().files.list(alternate.token, client, active)).files.map((f) => f.id),
  ).toEqual([attachedFile]);
  expect((await grading().queue(alternate.token, client)).records.map((r) => r.id)).toEqual([id]);
  const routing = await grading().routing(clientAdmin.token, client);
  expect(routing.appeals[0]).not.toHaveProperty('reason');
  expect(routing.appeals[0]).not.toHaveProperty('scores');

  await expect(grading().read(alternate.token, client, submissions[1])).rejects.toMatchObject({
    status: 404,
  });
  await grading().uphold(
    alternate.token,
    alternate.csrf,
    client,
    id,
    appeal.version,
    'Original decision independently supported by evidence',
  );
  await expect(grading().read(alternate.token, client, id)).rejects.toMatchObject({ status: 404 });
  await expect(delivery().files.list(alternate.token, client, active)).rejects.toMatchObject({
    status: 404,
  });
  const memberView = await grading().read(member.token, client, id);
  expect(memberView.approved?.total).toBe(90);
  expect(memberView.canAppeal).toBe(false);
  await expect(
    grading().appeal(member.token, member.csrf, client, id, memberView.submission.version, reason),
  ).rejects.toMatchObject({ code: 'appeal_exists' });
});
it('does not revive alternate authority when a qualifying role is revoked and replaced', async () => {
  const id = submissions[1],
    version = (await grading().read(member.token, client, id)).submission.version,
    r = await result(id, 85),
    appeal = await grading().appeal(member.token, member.csrf, client, id, version, reason);
  await grading().route(
    clientAdmin.token,
    clientAdmin.csrf,
    client,
    appeal.id,
    alternateUser,
    reason,
  );
  const role = (
    await instance.db.pool.query('SELECT role_assignment_id FROM learning_appeals WHERE id=$1', [
      appeal.id,
    ])
  ).rows[0].role_assignment_id;
  await tenancy.revokeRole(
    admin.token,
    admin.csrf,
    client,
    role,
    'Revoke independent reviewer role',
  );
  await tenancy.grantRole(
    admin.token,
    admin.csrf,
    client,
    alternateMembership,
    'coordinator',
    team,
    'Create a separate new reviewer role',
  );
  const guest = await auth.context();
  alternate = await auth.login(
    guest.token!,
    guest.csrf,
    'demo.1.1@example.invalid',
    'Separate demonstration password',
  );
  await tenancy.select(alternate.token, alternate.csrf, client);
  await expect(grading().read(alternate.token, client, id)).rejects.toMatchObject({ status: 404 });
  await grading().route(
    clientAdmin.token,
    clientAdmin.csrf,
    client,
    appeal.id,
    alternateUser,
    'Explicitly assign the new qualifying role',
  );
  await grading().manual(
    alternate.token,
    alternate.csrf,
    client,
    id,
    appeal.version,
    'approved',
    'Independent replacement supported by the evidence',
    r,
  );
  await expect(grading().read(alternate.token, client, id)).rejects.toMatchObject({ status: 404 });
  expect((await grading().read(member.token, client, id)).approved?.total).toBe(85);
});
