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

import { ProgrammeGeneration } from '../packages/domain/src/programme-generation.js';
import { AiGateway } from '../packages/domain/src/ai-gateway.js';
import { AiRegistry, aiConfig } from '../packages/domain/src/ai-registry.js';
import { mockProvider, ProviderFailure } from '../packages/domain/src/ai-provider.js';
import { claim, finish } from '../packages/domain/src/outbox.js';
let gateway: AiGateway, generation: ProgrammeGeneration;
const config = aiConfig();
(config.providers.mock as { requests_per_minute: number }).requests_per_minute = 1000;
beforeAll(() => {
  gateway = new AiGateway(new AiRegistry(enrolments, () => config), onboarding.key);
  generation = new ProgrammeGeneration(service(), gateway);
});
async function request(a: Awaited<ReturnType<typeof prepare>>, key = randomUUID(), feedback = '') {
  return generation.request(
    coordinator.token,
    coordinator.csrf,
    client,
    a.id,
    a.plan.version,
    key,
    feedback,
  );
}
async function drain(limit = 30) {
  for (let i = 0; i < limit; i++) {
    const job = await claim(instance.db, ['ai.task']);
    if (!job) return;
    if (job.kind === 'ai.task') await gateway.process(job);
    await finish(instance.db, job, 'done');
  }
  throw new Error('Unexpected repeated dispatch');
}
async function runState(id: string) {
  return (await instance.db.pool.query('SELECT * FROM ai_runs WHERE id=$1', [id])).rows[0];
}
it('reserves all four blocks, publishes only the complete draft and preserves approved history', async () => {
  const a = await prepare(),
    key = randomUUID(),
    run = await request(a, key);
  expect(run.reserved).toBe(4 * 5 * 72000);
  expect((await request(a, key)).id).toBe(run.id);
  await expect(request(a, key, 'Different feedback')).rejects.toMatchObject({
    code: 'ai_idempotency',
  });
  await expect(request(a)).rejects.toMatchObject({ code: 'generation_pending' });
  const first = await claim(instance.db, ['ai.task']);
  expect(first?.kind).toBe('ai.task');
  await gateway.process(first!);
  await finish(instance.db, first!, 'done');
  expect((await service().read(coordinator.token, client, a.id)).plan.version).toBe(1);
  expect((await runState(run.id)).status).toBe('running');
  await drain();
  const done = await runState(run.id),
    view = await service().read(coordinator.token, client, a.id);
  expect(done.status).toBe('complete');
  expect(done.configuration.prompt_version).toBe('generation-v1');
  expect(done.configuration.schema_version).toBe('block-v1');
  expect(Number(done.reserved)).toBe(0);
  expect(Number(done.spent)).toBe(800);
  expect(view.plan.version).toBe(2);
  expect(view.plan.state).toBe('draft');
  expect(view.plan.content.generation_run_id).toBe(run.id);
  expect(done.task_input).not.toContain('Confirmed');
  const blocks = (
    await instance.db.pool.query('SELECT output FROM ai_blocks WHERE ai_run_id=$1', [run.id])
  ).rows;
  expect(blocks).toHaveLength(4);
  expect(blocks.every((b) => !b.output.includes('Synthetic'))).toBe(true);
  expect((await request(a, key)).id).toBe(run.id);
  await service().review(coordinator.token, coordinator.csrf, client, a.id, 2, false, '');
  await service().review(
    coordinator.token,
    coordinator.csrf,
    client,
    a.id,
    2,
    true,
    'Independent review of every generated block',
  );
  const second = await request({ ...a, plan: { ...a.plan, version: 2 } });
  await drain();
  expect((await runState(second.id)).status).toBe('complete');
  const approved = await service().read(coordinator.token, client, a.id, 2);
  expect(approved.plan.state).toBe('approved');
  expect(approved.approval).not.toBeNull();
  expect((await service().read(coordinator.token, client, a.id)).plan.version).toBe(3);
  expect(
    (await instance.db.pool.query('SELECT status FROM enrolments WHERE id=$1', [a.id])).rows[0]
      .status,
  ).toBe('ready');
});
it('bounds schema repair per block and never publishes a partial failed run', async () => {
  const a = await prepare('2091-01-01'),
    seen: boolean[] = [];
  gateway.providers.mock = async (profile, input) => {
    seen.push(Boolean(input.repair));
    return { ...(await mockProvider(profile, input)), text: '{"approve":true}' };
  };
  const run = await request(a);
  await drain();
  gateway.providers.mock = mockProvider;
  expect((await runState(run.id)).status).toBe('failed');
  expect(seen.filter(Boolean)).toHaveLength(1);
  expect((await service().read(coordinator.token, client, a.id)).plan.version).toBe(1);
  expect(Number((await runState(run.id)).reserved)).toBe(0);
  expect(
    (
      await instance.db.pool.query(
        "SELECT id FROM ai_blocks WHERE ai_run_id=$1 AND status='queued'",
        [run.id],
      )
    ).rowCount,
  ).toBe(0);
});
it('rechecks changed baseline after provider I/O and retains all human content', async () => {
  const a = await prepare('2091-01-01');
  let changed = false;
  gateway.providers.mock = async (profile, input) => {
    if (!changed) {
      changed = true;
      await service().create(
        coordinator.token,
        coordinator.csrf,
        client,
        a.id,
        1,
        a.onboardingVersion,
        'Refresh during external generation',
      );
    }
    return mockProvider(profile, input);
  };
  const run = await request(a);
  await drain();
  gateway.providers.mock = mockProvider;
  expect((await runState(run.id)).status).toBe('failed');
  const view = await service().read(coordinator.token, client, a.id);
  expect(view.plan.version).toBe(2);
  expect(view.plan.content.generation_run_id).toBeUndefined();
});
it('retains ambiguous reservation, cancels sibling blocks and requires reconciliation', async () => {
  const a = await prepare('2091-01-01');
  gateway.providers.mock = async () => {
    throw new ProviderFailure('ambiguous');
  };
  const run = await request(a);
  await drain();
  gateway.providers.mock = mockProvider;
  expect((await runState(run.id)).status).toBe('ambiguous');
  expect(Number((await runState(run.id)).reserved)).toBe(run.reserved);
  await expect(request(a)).rejects.toMatchObject({ code: 'generation_pending' });
  await gateway.reconcile(
    admin.token,
    admin.csrf,
    client,
    run.id,
    0,
    'Confirmed synthetic provider had no charge',
  );
  const retry = await request(a);
  await drain();
  expect((await runState(retry.id)).status).toBe('complete');
});
it('rejects members, another client, stale inputs and exhausted budget before dispatch', async () => {
  const a = await prepare('2091-01-01');
  await expect(
    generation.request(member.token, member.csrf, client, a.id, 1, randomUUID()),
  ).rejects.toMatchObject({ status: 403 });
  await expect(generation.read(coordinator.token, other, a.id)).rejects.toMatchObject({
    status: 403,
  });
  config.programmeLimit = 1;
  await expect(request(a)).rejects.toMatchObject({ code: 'spend_limit' });
  config.programmeLimit = 5000000;
  expect((await generation.read(coordinator.token, client, a.id)).runs).toHaveLength(0);
  await onboarding.save(
    coordinator.token,
    coordinator.csrf,
    client,
    a.id,
    'profile',
    inputs.profile,
    a.onboardingVersion,
  );
  await expect(request(a)).rejects.toMatchObject({ code: 'programme_inputs_changed' });
});
it('rolls back a capacity-conflicted final draft but retains known usage charges', async () => {
  const competing = await prepare('2092-01-01');
  await request(competing);
  await drain();
  await service().review(coordinator.token, coordinator.csrf, client, competing.id, 2, false, '');
  const target = await prepare('2092-01-01');
  let calls = 0;
  gateway.providers.mock = async (profile, input) => {
    if (++calls === 4)
      await service().review(
        coordinator.token,
        coordinator.csrf,
        client,
        competing.id,
        2,
        true,
        'Reserve competing approved curriculum capacity',
      );
    return mockProvider(profile, input);
  };
  const run = await request(target);
  await drain();
  gateway.providers.mock = mockProvider;
  const result = await runState(run.id);
  expect(result.status).toBe('failed');
  expect(Number(result.spent)).toBe(800);
  expect(Number(result.reserved)).toBe(0);
  expect(result.result_version_id).toBeNull();
  expect((await service().read(coordinator.token, client, target.id)).plan.version).toBe(1);
  expect((await service().read(coordinator.token, client, competing.id)).plan.state).toBe(
    'approved',
  );
});
it('recovers sibling jobs deferred while another block is performing external work', async () => {
  const a = await prepare('2093-01-01'),
    run = await request(a);
  let release!: () => void, entered!: () => void;
  const waiting = new Promise<void>((resolve) => {
      release = resolve;
    }),
    started = new Promise<void>((resolve) => {
      entered = resolve;
    });
  gateway.providers.mock = async (profile, input) => {
    entered();
    await waiting;
    return mockProvider(profile, input);
  };
  const first = (await claim(instance.db, ['ai.task']))!;
  const running = gateway.process(first);
  await started;
  const sibling = (await claim(instance.db, ['ai.task']))!;
  await gateway.process(sibling);
  await finish(instance.db, sibling, 'done');
  release();
  await running;
  await finish(instance.db, first, 'done');
  gateway.providers.mock = mockProvider;
  await drain();
  expect((await runState(run.id)).status).toBe('running');
  await gateway.recover();
  await drain();
  expect((await runState(run.id)).status).toBe('complete');
});
it('keeps archived generation metadata readable after temporary input retention', async () => {
  const a = await prepare('2092-01-01'),
    key = randomUUID(),
    run = await request(a, key);
  await drain();
  await instance.db.pool.query('UPDATE ai_runs SET task_input=NULL,feedback=NULL WHERE id=$1', [
    run.id,
  ]);
  const view = await generation.read(coordinator.token, client, a.id, run.id);
  expect(view.runs[0]).toMatchObject({ id: run.id, baseVersion: null, feedback: '' });
  await expect(request(a, key)).rejects.toMatchObject({ status: 409, code: 'ai_trace_pruned' });
});
it('stops queued generation when authority is revoked', async () => {
  const a = await prepare('2091-01-01'),
    run = await request(a);
  await instance.db.pool.query('UPDATE coordinator_allocations SET ends_at=now() WHERE id=$1', [
    allocation,
  ]);
  await drain();
  expect((await runState(run.id)).status).toBe('failed');
  expect(
    (
      await instance.db.pool.query(
        'SELECT count(*) count FROM programme_versions WHERE enrolment_id=$1',
        [a.id],
      )
    ).rows[0].count,
  ).toBe('1');
});
