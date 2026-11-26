import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { testDatabase } from './helpers.js';
import { Auth } from '../packages/domain/src/auth.js';
import { Tenancy } from '../packages/domain/src/tenancy.js';
import { Enrolments } from '../packages/domain/src/enrolments.js';
import { AssessmentDefinitions } from '../packages/domain/src/assessment-definitions.js';
import { AssessmentAssignments } from '../packages/domain/src/assessment-assignments.js';
import { AssessmentResponses } from '../packages/domain/src/assessment-responses.js';
import { AssessmentReviews } from '../packages/domain/src/assessment-reviews.js';
import { EvidenceFiles } from '../packages/domain/src/evidence-files.js';
type Session = { token: string; csrf: string };
let instance: Awaited<ReturnType<typeof testDatabase>>,
  auth: Auth,
  tenancy: Tenancy,
  enrolments: Enrolments,
  definitions: AssessmentDefinitions,
  assignments: AssessmentAssignments,
  responses: AssessmentResponses,
  reviews: AssessmentReviews,
  files: EvidenceFiles;
let admin: Session, clientAdmin: Session, coordinator: Session, member: Session, alternate: Session;
let client: string,
  memberId: string,
  coordinatorId: string,
  alternateId: string,
  alternateUser: string,
  coordinatorUser: string,
  team: string,
  definition: string,
  dir: string;
const key = randomBytes(32);
async function login(email: string, password = 'Separate demonstration password') {
  const guest = await auth.context(),
    s = await auth.login(guest.token!, guest.csrf, email, password);
  if (client) await tenancy.select(s.token, s.csrf, client);
  return s;
}
beforeAll(async () => {
  instance = await testDatabase();
  auth = new Auth(instance.db, key);
  tenancy = new Tenancy(auth);
  enrolments = new Enrolments(auth);
  definitions = new AssessmentDefinitions(auth, key);
  assignments = new AssessmentAssignments(definitions);
  dir = await mkdtemp(path.join(tmpdir(), 'tracker-review-'));
  files = new EvidenceFiles(enrolments, undefined, dir, key);
  responses = new AssessmentResponses(assignments, files);
  reviews = new AssessmentReviews(responses);
  const guest = await auth.context();
  await auth.setup(guest.token!, guest.csrf, {
    name: 'Admin',
    email: 'admin@example.invalid',
    password: 'Unique administrator passphrase',
    demoPassword: 'Separate demonstration password',
  });
  admin = await login('admin@example.invalid', 'Unique administrator passphrase');
  client = (await tenancy.choices(admin.token))[0].id;
  await tenancy.select(admin.token, admin.csrf, client);
  clientAdmin = await login('demo.1.0@example.invalid');
  coordinator = await login('demo.1.2@example.invalid');
  member = await login('demo.1.3@example.invalid');
  alternate = await login('demo.1.1@example.invalid');
  const rows = (
    await instance.db.pool.query(
      'SELECT cm.id,u.id user_id,u.email FROM client_memberships cm JOIN users u ON u.id=cm.user_id WHERE cm.organisation_id=$1',
      [client],
    )
  ).rows;
  memberId = rows.find((r) => r.email === 'demo.1.3@example.invalid').id;
  coordinatorId = rows.find((r) => r.email === 'demo.1.2@example.invalid').id;
  coordinatorUser = rows.find((r) => r.email === 'demo.1.2@example.invalid').user_id;
  alternateId = rows.find((r) => r.email === 'demo.1.1@example.invalid').id;
  alternateUser = rows.find((r) => r.email === 'demo.1.1@example.invalid').user_id;
  team = (await instance.db.pool.query('SELECT id FROM groups WHERE organisation_id=$1', [client]))
    .rows[0].id;
  const allocation = (
      await instance.db.pool.query(
        "SELECT id FROM coordinator_allocations WHERE member_membership_id=$1 AND kind='primary' AND ends_at IS NULL",
        [memberId],
      )
    ).rows[0].id,
    actor = (await auth.context(admin.token)).user!;
  await instance.db.pool.query(
    "INSERT INTO client_sensitive_grants(id,organisation_id,environment,allocation_id,granted_by,reason) VALUES($1,$2,'test',$3,$4,'Independent test grant')",
    [randomUUID(), client, allocation, actor.id],
  );
  definition = (
    await definitions.save(
      coordinator.token,
      coordinator.csrf,
      client,
      {
        title: 'Review evidence',
        questions: [{ id: 'written', type: 'open_response', prompt: 'Explain your evidence.' }],
        rubric: {
          threshold: 75,
          criteria: [
            {
              id: 'evidence',
              category: 'Practice',
              label: 'Evidence',
              guidance: 'Use evidence',
              weight: 1,
            },
          ],
        },
      },
      null,
      0,
      randomUUID(),
    )
  ).id;
  await definitions.publish(coordinator.token, coordinator.csrf, client, definition, 1);
});
afterAll(async () => {
  await instance?.close();
  if (dir) await rm(dir, { recursive: true, force: true });
});
async function submitted(withFile = false, subject = { id: memberId, session: member }) {
  const enrolment = (
    await enrolments.create(admin.token, admin.csrf, client, {
      memberId: subject.id,
      coordinatorId,
      groupId: team,
      title: 'Review record',
      reason: 'Synthetic review verification',
    })
  ).id;
  const assignment = (
    await assignments.create(
      coordinator.token,
      coordinator.csrf,
      client,
      definition,
      'member',
      enrolment,
    )
  ).id;
  let file: string | null = null;
  if (withFile) {
    const uploaded = await files.upload(
      subject.session.token,
      subject.session.csrf,
      client,
      enrolment,
      Buffer.from('Verified file content'),
      'evidence.txt',
      'evidence',
    );
    file = uploaded.id;
    await instance.db.pool.query("UPDATE evidence_files SET scan_status='clean' WHERE id=$1", [
      file,
    ]);
  }
  await responses.save(subject.session.token, subject.session.csrf, client, assignment, 1, {
    responses: {
      written: 'Submitted written evidence with enough detail for a synthetic demonstration.',
    },
    files: file ? [file] : [],
    save_token: randomUUID(),
  });
  const submission = await responses.submit(
    subject.session.token,
    subject.session.csrf,
    client,
    assignment,
    2,
    randomUUID(),
  );
  return {
    id: assignment,
    enrolment,
    attempt: submission.receipt,
    version: submission.version,
    file,
  };
}
function score(attempt: string, evidence = attempt + ':written') {
  return {
    rubric_id: definition,
    rubric_version: 1,
    criteria: [
      {
        id: 'evidence',
        score: 80,
        evidence_ids: [evidence],
        feedback: 'Evidence supports the result.',
        insufficient_evidence: false,
      },
    ],
  };
}
function decide(
  a: Awaited<ReturnType<typeof submitted>>,
  actor = coordinator,
  outcome: 'approved' | 'rejected' = 'approved',
  version = a.version,
  result: unknown = score(a.attempt),
) {
  return reviews.decide(
    actor.token,
    actor.csrf,
    client,
    a.id,
    a.attempt,
    version,
    outcome,
    'Verified human decision',
    result,
  );
}

import { beforeEach } from 'vitest';
import { AiRegistry, aiConfig, type AiConfig } from '../packages/domain/src/ai-registry.js';
import { AiGateway } from '../packages/domain/src/ai-gateway.js';
import { AssessmentAnalysis } from '../packages/domain/src/assessment-analysis.js';
import { ProviderFailure, mockProvider } from '../packages/domain/src/ai-provider.js';
import { claim, finish, type Job } from '../packages/domain/src/outbox.js';
import { Platform } from '../packages/domain/src/platform.js';
let config: AiConfig, registry: AiRegistry, gateway: AiGateway, analysis: AssessmentAnalysis;
beforeEach(async () => {
  await tenancy.select(admin.token, admin.csrf, client);
  config = aiConfig();
  config.providers.mock2 = { ...(config.providers.mock as object), model: 'synthetic-fallback-v1' };
  if (!registry) {
    registry = new AiRegistry(enrolments, () => config);
    gateway = new AiGateway(registry, key);
    analysis = new AssessmentAnalysis(reviews, gateway);
  }
  gateway.providers.mock = mockProvider;
  const current = await instance.db.transaction((sql) =>
    registry.policy(sql, client, 'test', 'assess_initial'),
  );
  await registry.save(
    admin.token,
    admin.csrf,
    client,
    'assess_initial',
    current?.version ?? 0,
    'mock',
    null,
  );
});
async function requested() {
  const a = await submitted();
  const r = await analysis.request(
    coordinator.token,
    coordinator.csrf,
    client,
    a.id,
    a.attempt,
    a.version,
    'Request synthetic provisional analysis',
  );
  return { ...a, request: r };
}
async function processNext() {
  const job = await claim(instance.db, ['ai.task']);
  expect(job?.kind).toBe('ai.task');
  await gateway.process(job!);
  await finish(instance.db, job!, 'done').catch((e) => {
    if (e.code !== 'lease_lost') throw e;
  });
  return job!;
}
async function row(id: string) {
  return (await instance.db.pool.query('SELECT * FROM ai_runs WHERE id=$1', [id])).rows[0];
}
async function makeReady(run: string) {
  await instance.db.pool.query(
    "UPDATE ai_blocks SET available_at=now() WHERE ai_run_id=$1 AND status='queued'",
    [run],
  );
  await instance.db.pool.query(
    "UPDATE outbox_events SET available_at=now() WHERE kind='ai.task' AND payload->>'blockId' IN (SELECT id::text FROM ai_blocks WHERE ai_run_id=$1) AND status='pending'",
    [run],
  );
}
it('pins safe configuration, encrypts evidence and releases unused reserve only after provisional output', async () => {
  config.providers.mock = {
    ...(config.providers.mock as object),
    secret: 'not-for-snapshots',
    apiKey: 'never-copy',
  };
  const a = await requested(),
    queued = await row(a.request.run);
  expect(Number(queued.reserved)).toBe(360000);
  expect(queued.task_input).not.toContain('Submitted written');
  expect(JSON.stringify(queued.configuration)).not.toMatch(/not-for-snapshots|never-copy/);
  let outside = false;
  gateway.providers.mock = async (p, input) => {
    outside = Boolean((await instance.db.pool.query('SELECT 1')).rowCount);
    return mockProvider(p, input);
  };
  await processNext();
  expect(outside).toBe(true);
  const done = await row(a.request.run);
  expect(done.status).toBe('complete');
  expect(Number(done.spent)).toBe(200);
  expect(Number(done.reserved)).toBe(0);
  const privateView = await reviews.read(coordinator.token, client, a.id);
  expect(privateView.reviews[0]).toMatchObject({ status: 'provisional', result: { total: 70 } });
  expect(await reviews.read(member.token, client, a.id)).toMatchObject({
    approved: null,
    reviews: [],
    evidence: [],
  });
  expect(await reviews.read(coordinator.token, client, a.id)).toMatchObject({
    status: 'review_pending',
    canAnalyze: true,
  });
  expect(await reviews.read(member.token, client, a.id)).toMatchObject({ canAnalyze: false });
  const publicJson = JSON.stringify(await responses.read(member.token, client, a.id));
  expect(publicJson).not.toMatch(/Synthetic demonstration score|rubric|answer_key/);
  await reviews.decide(
    coordinator.token,
    coordinator.csrf,
    client,
    a.id,
    a.attempt,
    privateView.version,
    'approved',
    'Independently reviewed the synthetic suggestion',
    { rubric_id: definition, rubric_version: 1, criteria: privateView.reviews[0].result.criteria },
    privateView.reviews[0].id,
  );
  expect((await reviews.read(member.token, client, a.id)).approved?.result.total).toBe(70);
});
it('reserves budget atomically and rejects real-member or unsupported-provider requests without queued remnants', async () => {
  const a = await submitted(),
    before = Number((await instance.db.pool.query('SELECT count(*) FROM ai_runs')).rows[0].count);
  config.organisationLimit = 1;
  await expect(
    analysis.request(
      coordinator.token,
      coordinator.csrf,
      client,
      a.id,
      a.attempt,
      a.version,
      'Budget-bound analysis request',
    ),
  ).rejects.toMatchObject({ status: 422, code: 'spend_limit' });
  expect((await responses.read(member.token, client, a.id)).status).toBe('submitted');
  expect(Number((await instance.db.pool.query('SELECT count(*) FROM ai_runs')).rows[0].count)).toBe(
    before,
  );
  config.organisationLimit = 10000000;
  const realMember = (await instance.db.pool.query("SELECT u.id,cm.id membership FROM users u JOIN client_memberships cm ON cm.user_id=u.id WHERE u.email='demo.1.4@example.invalid'")).rows[0];
  await instance.db.pool.query('UPDATE users SET is_synthetic=false WHERE id=$1', [realMember.id]);
  const realAllocation = (await instance.db.pool.query('SELECT id FROM coordinator_allocations WHERE member_membership_id=$1 AND ends_at IS NULL', [realMember.membership])).rows[0].id;
  await tenancy.sensitive(clientAdmin.token, clientAdmin.csrf, client, realAllocation, true, 'Independent non-synthetic fixture authorization');
  coordinator = await login('demo.1.2@example.invalid');
  await tenancy.select(coordinator.token, coordinator.csrf, client);
  const real = await submitted(false, { id: realMember.membership, session: await login('demo.1.4@example.invalid') });
  await expect(analysis.request(coordinator.token, coordinator.csrf, client, real.id, real.attempt, real.version, 'Analysis for non-synthetic member')).rejects.toMatchObject({ status: 422 });
  expect(Number((await instance.db.pool.query('SELECT count(*) FROM ai_runs')).rows[0].count)).toBe(before);
  await expect(
    registry.save(admin.token, admin.csrf, client, 'assess_initial', 1, 'anthropic', null),
  ).rejects.toBeDefined();
});
it('allows one repair, charges known usage, and stops repeated invalid output', async () => {
  const a = await requested();
  let calls = 0;
  gateway.providers.mock = async () => {
    calls++;
    return { text: '{}', inputTokens: 100, outputTokens: 100, externalId: 'invalid-fixture' };
  };
  await processNext();
  expect((await row(a.request.run)).status).toBe('running');
  await processNext();
  expect(calls).toBe(2);
  const failed = await row(a.request.run);
  expect(failed.status).toBe('failed');
  expect(Number(failed.spent)).toBe(400);
  expect(Number(failed.reserved)).toBe(0);
  expect((await responses.read(member.token, client, a.id)).status).toBe('technical_failure');
});
it('switches to the pinned fallback only after throttling and respects the attempt bound', async () => {
  const policy = await instance.db.transaction((sql) =>
    registry.policy(sql, client, 'test', 'assess_initial'),
  );
  await registry.save(
    admin.token,
    admin.csrf,
    client,
    'assess_initial',
    policy!.version,
    'mock',
    'mock2',
  );
  const a = await requested(),
    profiles: string[] = [];
  gateway.providers.mock = async (p, input) => {
    profiles.push(p.id);
    if (p.id === 'mock') throw new ProviderFailure('throttled');
    return mockProvider(p, input);
  };
  await processNext();
  await makeReady(a.request.run);
  await processNext();
  expect(profiles).toEqual(['mock', 'mock2']);
  expect((await row(a.request.run)).status).toBe('complete');
  const b = await requested();
  let calls = 0;
  gateway.providers.mock = async () => {
    calls++;
    throw new ProviderFailure('throttled');
  };
  for (let i = 0; i < 4; i++) {
    await makeReady(b.request.run);
    await processNext();
  }
  expect(calls).toBe(4);
  expect((await row(b.request.run)).status).toBe('failed');
});
it('retains ambiguous reservations, never automatically retries, and requires explicit reconciliation', async () => {
  const a = await requested();
  gateway.providers.mock = async () => {
    throw new Error('Untrusted private transport message');
  };
  await processNext();
  const failed = await row(a.request.run);
  expect(failed.status).toBe('ambiguous');
  expect(Number(failed.reserved)).toBe(360000);
  expect(JSON.stringify(failed)).not.toContain('Untrusted private');
  await gateway.recover();
  expect(await claim(instance.db, ['ai.task'])).toBeUndefined();
  await expect(
    gateway.reconcile(
      member.token,
      member.csrf,
      client,
      a.request.run,
      100,
      'Confirm provider charge',
    ),
  ).rejects.toMatchObject({ status: 403 });
  await gateway.reconcile(
    admin.token,
    admin.csrf,
    client,
    a.request.run,
    100,
    'Confirmed provider charge from synthetic ledger',
  );
  expect(await row(a.request.run)).toMatchObject({ status: 'failed' });
  expect(Number((await row(a.request.run)).reserved)).toBe(0);
  await gateway.recover();
  expect(await claim(instance.db, ['ai.task'])).toBeUndefined();
});
it('does not publish results after permission revocation, lease expiry, or provider policy withdrawal', async () => {
  const a = await requested();
  gateway.providers.mock = async (p, input) => {
    await instance.db.pool.query(
      'UPDATE client_sensitive_grants SET ends_at=now() WHERE organisation_id=$1',
      [client],
    );
    return mockProvider(p, input);
  };
  await processNext();
  expect((await row(a.request.run)).status).toBe('failed');
  expect((await reviews.read(member.token, client, a.id)).approved).toBeNull();
  await instance.db.pool.query(
    'UPDATE client_sensitive_grants SET ends_at=NULL WHERE organisation_id=$1',
    [client],
  );
  const b = await requested(),
    job = await claim(instance.db, ['ai.task']);
  expect(job).toBeDefined();
  gateway.providers.mock = async (p, input) => {
    await instance.db.pool.query(
      "UPDATE outbox_events SET lease_until=now()-interval '1 second' WHERE id=$1",
      [job!.id],
    );
    return mockProvider(p, input);
  };
  await gateway.process(job!);
  expect((await row(b.request.run)).status).toBe('ambiguous');
  expect(Number((await row(b.request.run)).reserved)).toBe(360000);
  const c = await requested();
  gateway.providers.mock = async (p, input) => {
    config.providers.mock = { ...(config.providers.mock as object), enabled: false };
    return mockProvider(p, input);
  };
  await processNext();
  expect((await row(c.request.run)).status).toBe('failed');
});
it('recovers dispatch gaps but treats interrupted provider attempts as ambiguous', async () => {
  const a = await requested();
  await instance.db.pool.query(
    "UPDATE outbox_events SET status='failed' WHERE kind='ai.task' AND status='pending'",
  );
  await gateway.recover();
  await processNext();
  expect((await row(a.request.run)).status).toBe('complete');
  const b = await requested();
  const block = (
    await instance.db.pool.query('SELECT id FROM ai_blocks WHERE ai_run_id=$1', [b.request.run])
  ).rows[0].id;
  await instance.db.pool.query(
    "UPDATE ai_blocks SET status='running',started_at=now()-interval '4 minutes' WHERE id=$1",
    [block],
  );
  await instance.db.pool.query("UPDATE ai_runs SET status='running' WHERE id=$1", [b.request.run]);
  await gateway.recover();
  expect((await row(b.request.run)).status).toBe('ambiguous');
  expect(Number((await row(b.request.run)).reserved)).toBe(360000);
  await processNext(); // Old delivery is now a no-op.
});
it('serializes provider calls per client without holding a transaction over provider I/O', async () => {
  const a = await requested(),
    b = await requested();
  let release!: () => void, started!: () => void;
  const held = new Promise<void>((resolve) => {
      release = resolve;
    }),
    entered = new Promise<void>((resolve) => {
      started = resolve;
    });
  gateway.providers.mock = async (p, input) => {
    started();
    await held;
    return mockProvider(p, input);
  };
  const first = await claim(instance.db, ['ai.task']),
    running = gateway.process(first!);
  await entered;
  try {
    await processNext();
    expect(
      Number(
        (await instance.db.pool.query("SELECT count(*) FROM ai_blocks WHERE status='running'"))
          .rows[0].count,
      ),
    ).toBe(1);
  } finally {
    release();
  }
  await running;
  await finish(instance.db, first!, 'done');
  gateway.providers.mock = mockProvider;
  await gateway.recover();
  await processNext();
  expect((await row(a.request.run)).status).toBe('complete');
  expect((await row(b.request.run)).status).toBe('complete');
});
it('counts known refusal charges and fails safely on a budget overrun', async () => {
  const a = await requested();
  gateway.providers.mock = async () => ({
    text: '{}',
    inputTokens: 5,
    outputTokens: 5,
    externalId: 'refusal',
    refused: true,
  });
  await processNext();
  expect((await row(a.request.run)).status).toBe('failed');
  expect(Number((await row(a.request.run)).spent)).toBe(10);
  const b = await requested();
  gateway.providers.mock = async (p, input) => ({
    ...(await mockProvider(p, input)),
    inputTokens: 1000000,
    outputTokens: 1000000,
  });
  await processNext();
  expect((await row(b.request.run)).status).toBe('failed');
  expect(Number((await row(b.request.run)).spent)).toBe(2000000);
});
it('fences environment dispatch and cancels suspension without reactivation resurrection', async () => {
  const a = await requested(),
    b = await requested(),
    job = await claim(instance.db, ['ai.task']);
  await expect(gateway.process({ ...job!, environment: 'production' })).rejects.toMatchObject({
    status: 403,
  });
  const platform = new Platform(auth);
  let state = (
    await instance.db.pool.query(
      'SELECT version FROM platform_client_states WHERE organisation_id=$1',
      [client],
    )
  ).rows[0];
  gateway.providers.mock = async (p, input) => {
    await platform.client(
      admin.token,
      admin.csrf,
      client,
      'Demo Client 1',
      state.version,
      'Suspend the synthetic client during a call',
      true,
    );
    return mockProvider(p, input);
  };
  await gateway.process(job!);
  expect((await row(a.request.run)).status).toBe('ambiguous');
  expect(Number((await row(a.request.run)).reserved)).toBe(360000);
  expect((await row(b.request.run)).status).toBe('cancelled');
  expect(Number((await row(b.request.run)).reserved)).toBe(0);
  state = (
    await instance.db.pool.query(
      'SELECT version FROM platform_client_states WHERE organisation_id=$1',
      [client],
    )
  ).rows[0];
  await platform.client(
    admin.token,
    admin.csrf,
    client,
    'Demo Client 1',
    state.version,
    'Reactivate without restarting cancelled calls',
    false,
  );
  await gateway.recover();
  expect((await row(a.request.run)).status).toBe('ambiguous');
  expect((await row(b.request.run)).status).toBe('cancelled');
});

it('limits provider administration to the selected client and returns only safe metadata', async () => {
  member = await login('demo.1.3@example.invalid');
  const settings = await registry.settings(admin.token, client);
  expect(settings.policies.map((policy) => policy.task).sort()).toEqual([
    'assess_initial',
    'generate_assessment_topic',
    'generate_programme',
    'grade_submission',
    'propose_adaptation',
    'suggest_kpi_actions',
  ]);
  expect(settings.providers[0]).not.toHaveProperty('secret_reference');
  expect(settings.providers[0]).not.toHaveProperty('endpoint');
  expect(settings.providers[0]).not.toHaveProperty('secret');
  await expect(registry.settings(member.token, client)).rejects.toMatchObject({ status: 403 });
  await expect(
    registry.save(admin.token, admin.csrf, client, 'assess_initial', 0, 'mock', null),
  ).rejects.toMatchObject({ code: 'stale_routing' });
});
