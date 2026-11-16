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
async function submitted(withFile = false, groupId: string | null = team) {
  const enrolment = (
    await enrolments.create(admin.token, admin.csrf, client, {
      memberId,
      coordinatorId,
      groupId,
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
      member.token,
      member.csrf,
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
  await responses.save(member.token, member.csrf, client, assignment, 1, {
    responses: { written: 'Submitted written evidence' },
    files: file ? [file] : [],
    save_token: randomUUID(),
  });
  const submission = await responses.submit(
    member.token,
    member.csrf,
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
it('QA D02 characterizes no-team appeal freeze and unavailable alternate routing', async () => {
  const a = await submitted(false, null);
  const rejected = await decide(a, coordinator, 'rejected');
  const appeal = await reviews.appeal(
    member.token,
    member.csrf,
    client,
    a.id,
    rejected.version,
    'Synthetic request for independent review',
  );
  const routing = await reviews.routing(clientAdmin.token, client);
  expect(routing.canRoute).toBe(true);
  expect(routing.appeals.find((p) => p.id === appeal.appeal)?.reviewers).toEqual([]);
  await expect(
    reviews.route(
      clientAdmin.token,
      clientAdmin.csrf,
      client,
      appeal.appeal,
      alternateUser,
      'Synthetic independent routing',
    ),
  ).rejects.toMatchObject({ status: 422, code: 'invalid_alternate' });
  await expect(
    responses.save(member.token, member.csrf, client, a.id, appeal.version, {
      responses: { written: 'New evidence' },
      save_token: randomUUID(),
    }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    responses.submit(member.token, member.csrf, client, a.id, appeal.version, randomUUID()),
  ).rejects.toMatchObject({ status: 409 });
  await expect(decide(a, coordinator, 'approved', appeal.version)).rejects.toMatchObject({
    status: 403,
  });
  expect((await reviews.read(member.token, client, a.id)).appeal).toMatchObject({ status: 'open' });
});
it('QA D07 characterizes absent member-safe return feedback without leaking private rationale', async () => {
  const a = await submitted();
  const rejected = await decide(a, coordinator, 'rejected');
  const view = await reviews.read(member.token, client, a.id);
  expect(view).toMatchObject({ approved: null, reviews: [], rubric: null, evidence: [] });
  expect(JSON.stringify(view)).not.toContain('Verified human decision');
  expect(JSON.stringify(view)).not.toContain('Evidence supports the result.');
  await responses.save(member.token, member.csrf, client, a.id, rejected.version, {
    responses: { written: 'Revised evidence' },
    save_token: randomUUID(),
  });
  expect((await responses.read(member.token, client, a.id)).status).toBe('draft');
});
it('requires reviewer authority, pins the latest version and projects approved results only', async () => {
  const a = await submitted();
  await expect(decide(a, member)).rejects.toMatchObject({ status: 403 });
  await expect(decide(a, admin)).rejects.toMatchObject({ status: 404 });
  await expect(decide(a, alternate)).rejects.toMatchObject({ status: 404 });
  expect(await reviews.read(member.token, client, a.id)).toMatchObject({
    approved: null,
    reviews: [],
    rubric: null,
    evidence: [],
  });
  const approved = await decide(a);
  await expect(decide(a)).rejects.toMatchObject({ status: 409 });
  const view = await reviews.read(member.token, client, a.id);
  expect(view.approved).toMatchObject({
    contract: 'C03-v1',
    result: { total: 80, success: true },
    plan_creation_available: false,
  });
  expect(view.reviews).toEqual([]);
  expect(JSON.stringify(view)).not.toContain('Verified human decision');
  expect(JSON.stringify(view)).not.toContain('answer_key');
  const raw = (
    await instance.db.pool.query('SELECT result FROM assessment_reviews WHERE id=$1', [
      approved.review,
    ])
  ).rows[0].result;
  expect(raw).not.toContain('Evidence supports');
  await expect(
    instance.db.pool.query("UPDATE assessment_reviews SET reason='changed' WHERE id=$1", [
      approved.review,
    ]),
  ).rejects.toThrow('immutable');
});
it('requires explicit current file confirmation and rechecks bytes at decision time', async () => {
  const a = await submitted(true);
  expect((await reviews.read(coordinator.token, client, a.id)).files).toEqual([
    { id: a.file, name: 'evidence.txt', status: 'clean', extraction: null },
  ]);
  expect((await reviews.read(member.token, client, a.id)).files).toEqual([]);
  await expect(
    decide(a, coordinator, 'approved', a.version, score(a.attempt, a.file!)),
  ).rejects.toMatchObject({ status: 422 });
  const confirmed = await reviews.confirm(
    coordinator.token,
    coordinator.csrf,
    client,
    a.id,
    a.attempt,
    a.version,
    a.file!,
    'Verified file content',
    'Compared against the original file',
  );
  const raw = (
    await instance.db.pool.query('SELECT text FROM assessment_file_confirmations WHERE id=$1', [
      confirmed.confirmation,
    ])
  ).rows[0].text;
  expect(raw).not.toContain('Verified file content');
  const row = (
    await instance.db.pool.query('SELECT storage_key FROM evidence_files WHERE id=$1', [a.file])
  ).rows[0];
  await writeFile(files.file(row.storage_key), 'Tampered bytes');
  await expect(
    decide(a, coordinator, 'approved', confirmed.version, score(a.attempt, confirmed.confirmation)),
  ).rejects.toMatchObject({ status: 422 });
  await writeFile(files.file(row.storage_key), 'Verified file content');
  await expect(
    decide(a, coordinator, 'approved', confirmed.version, score(a.attempt, confirmed.confirmation)),
  ).resolves.toMatchObject({ status: 'approved' });
});
it('allows rejection and resubmission but never reviews a superseded attempt', async () => {
  const a = await submitted(),
    decision = await decide(a, coordinator, 'rejected');
  await responses.save(member.token, member.csrf, client, a.id, decision.version, {
    responses: { written: 'Revised submitted evidence' },
    save_token: randomUUID(),
  });
  const next = await responses.submit(
    member.token,
    member.csrf,
    client,
    a.id,
    decision.version + 1,
    randomUUID(),
  );
  await expect(decide(a, coordinator, 'approved', next.version)).rejects.toMatchObject({
    status: 409,
  });
  expect((await responses.read(member.token, client, a.id)).attempts).toHaveLength(2);
});
it('routes case-only appeals and closes alternate record/file access immediately on resolution', async () => {
  const a = await submitted(true),
    approved = await decide(a),
    appeal = await reviews.appeal(
      member.token,
      member.csrf,
      client,
      a.id,
      approved.version,
      'Please review the decision again',
    );
  await expect(
    responses.save(member.token, member.csrf, client, a.id, appeal.version, {
      responses: { written: 'Cannot edit during appeal' },
    }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(decide(a, coordinator, 'approved', appeal.version)).rejects.toMatchObject({
    status: 403,
  });
  await expect(
    reviews.route(
      admin.token,
      admin.csrf,
      client,
      appeal.appeal,
      alternateUser,
      'Choose independent reviewer',
    ),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    reviews.route(
      clientAdmin.token,
      clientAdmin.csrf,
      client,
      appeal.appeal,
      coordinatorUser,
      'Choose independent reviewer',
    ),
  ).rejects.toMatchObject({ status: 422 });
  await reviews.route(
    clientAdmin.token,
    clientAdmin.csrf,
    client,
    appeal.appeal,
    alternateUser,
    'Choose independent reviewer',
  );
  expect(await reviews.read(alternate.token, client, a.id)).toMatchObject({ canReview: true });
  expect(
    (await assignments.list(alternate.token, client)).assignments.some((r) => r.id === a.id),
  ).toBe(true);
  await expect(
    enrolments.record(
      instance.db.pool,
      (await auth.context(alternate.token)).user!,
      client,
      a.enrolment,
      'details',
    ),
  ).rejects.toMatchObject({ status: 404 });
  expect((await files.list(alternate.token, client, a.enrolment)).files.map((f) => f.id)).toEqual([
    a.file,
  ]);
  expect((await files.download(alternate.token, a.file!)).bytes.toString()).toBe(
    'Verified file content',
  );
  const unrelated = await files.upload(
    member.token,
    member.csrf,
    client,
    a.enrolment,
    Buffer.from('Unsubmitted file'),
    'unsubmitted.txt',
    'evidence',
  );
  await instance.db.pool.query("UPDATE evidence_files SET scan_status='clean' WHERE id=$1", [
    unrelated.id,
  ]);
  await expect(files.download(alternate.token, unrelated.id)).rejects.toMatchObject({
    status: 404,
  });
  expect((await reviews.read(member.token, client, a.id)).approved?.result.total).toBe(80);
  await reviews.uphold(
    alternate.token,
    alternate.csrf,
    client,
    a.id,
    appeal.version,
    'Original decision remains justified',
  );
  await expect(responses.read(alternate.token, client, a.id)).rejects.toMatchObject({
    status: 404,
  });
  await expect(files.download(alternate.token, a.file!)).rejects.toMatchObject({ status: 404 });
});
it('binds appeal access to the exact role grant without revival', async () => {
  const a = await submitted(),
    decision = await decide(a),
    appeal = await reviews.appeal(
      member.token,
      member.csrf,
      client,
      a.id,
      decision.version,
      'Request independent reconsideration',
    );
  await reviews.route(
    clientAdmin.token,
    clientAdmin.csrf,
    client,
    appeal.appeal,
    alternateUser,
    'Assign alternate reviewer',
  );
  const role = (
    await instance.db.pool.query('SELECT role_assignment_id FROM assessment_appeals WHERE id=$1', [
      appeal.appeal,
    ])
  ).rows[0].role_assignment_id;
  await tenancy.revokeRole(
    admin.token,
    admin.csrf,
    client,
    role,
    'Revoke temporary coordinator role',
  );
  await tenancy.grantRole(
    admin.token,
    admin.csrf,
    client,
    alternateId,
    'coordinator',
    team,
    'Restore coordinator role separately',
  );
  alternate = await login('demo.1.1@example.invalid');
  await expect(responses.read(alternate.token, client, a.id)).rejects.toMatchObject({
    status: 404,
  });
  await reviews.route(
    clientAdmin.token,
    clientAdmin.csrf,
    client,
    appeal.appeal,
    alternateUser,
    'Explicitly route the existing appeal again',
  );
  await expect(reviews.read(alternate.token, client, a.id)).resolves.toMatchObject({
    canReview: true,
  });
  await decide(a, alternate, 'approved', appeal.version);
  await expect(responses.read(alternate.token, client, a.id)).rejects.toMatchObject({
    status: 404,
  });
});

it('keeps routing metadata separate from sensitive assessment details', async () => {
  const a = await submitted(),
    decision = await decide(a),
    appeal = await reviews.appeal(
      member.token,
      member.csrf,
      client,
      a.id,
      decision.version,
      'Private appeal explanation',
    );
  expect(await reviews.routing(admin.token, client)).toEqual({ canRoute: false, appeals: [] });
  const routing = await reviews.routing(clientAdmin.token, client),
    row = routing.appeals.find((p) => p.id === appeal.appeal)!;
  expect(row).toBeDefined();
  expect(row.reviewers).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: alternateUser })]),
  );
  expect(row.reviewers.some((r) => r.id === coordinatorUser)).toBe(false);
  expect(JSON.stringify(routing)).not.toMatch(
    /Private appeal|Submitted written|total|rubric|feedback/,
  );
  await expect(reviews.read(clientAdmin.token, client, a.id)).rejects.toMatchObject({
    status: 404,
  });
});
it('blocks decisions during queued analysis and rejects a provisional source from another attempt', async () => {
  const a = await submitted(),
    queued = randomUUID();
  await instance.db.pool.query(
    "INSERT INTO assessment_reviews(id,organisation_id,environment,assignment_id,attempt_id,actor_id,sequence,kind,status,reason) VALUES($1,$2,'test',$3,$4,$5,1,'analysis','queued','Synthetic queued fixture')",
    [queued, client, a.id, a.attempt, coordinatorUser],
  );
  await expect(decide(a)).rejects.toMatchObject({ status: 409 });
  await instance.db.pool.query(
    "UPDATE assessment_reviews SET status='technical_failure' WHERE id=$1",
    [queued],
  );
  await expect(
    reviews.decide(
      coordinator.token,
      coordinator.csrf,
      client,
      a.id,
      a.attempt,
      a.version,
      'approved',
      'Human review after failed analysis',
      score(a.attempt),
      queued,
    ),
  ).rejects.toMatchObject({ status: 409 });
  await expect(decide(a)).resolves.toMatchObject({ status: 'approved' });
});
