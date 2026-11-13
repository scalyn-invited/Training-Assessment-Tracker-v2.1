import { digest } from '../packages/domain/src/crypto.js';
import { Operations } from '../packages/domain/src/operations.js';
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
async function submitted(withFile = false) {
  const enrolment = (
    await enrolments.create(admin.token, admin.csrf, client, {
      memberId,
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
import { beforeEach } from 'vitest';
import { readFile, readdir, mkdir, stat } from 'node:fs/promises';
import {
  DocumentExtractions,
  type Extraction,
} from '../packages/domain/src/document-extractions.js';
import { runDocument, type DocumentRunner } from '../packages/domain/src/document-runner.js';
import { claim, finish, type Job } from '../packages/domain/src/outbox.js';
let runner: DocumentRunner, extractions: DocumentExtractions;
beforeEach(() => {
  runner = runDocument;
  extractions = new DocumentExtractions(
    reviews,
    (...args) => runner(...args),
    path.join(dir, 'work'),
  );
});
async function requested() {
  const a = await submitted(true);
  const run = await extractions.requestAssessment(
    coordinator.token,
    coordinator.csrf,
    client,
    a.id,
    a.attempt,
    a.version,
    a.file!,
  );
  return { ...a, run };
}
async function job() {
  for (;;) {
    const next = await claim(instance.db, ['document.extract']);
    if (!next) throw new Error('Missing extraction dispatch');
    if (
      next.kind === 'document.extract' &&
      ['queued', 'waiting_scan'].includes((await row(String(next.payload.id))).status)
    )
      return next;
    await finish(instance.db, next, 'done');
  }
}
async function process() {
  const next = await job();
  await extractions.process(next);
  await finish(instance.db, next, 'done');
  return next;
}
async function row(id: string) {
  return (
    await instance.db.pool.query<Extraction>('SELECT * FROM document_extractions WHERE id=$1', [id])
  ).rows[0];
}
it('persists encrypted extraction drafts, deduplicates requests and requires explicit file confirmation', async () => {
  const a = await requested();
  expect(
    await extractions.requestAssessment(
      coordinator.token,
      coordinator.csrf,
      client,
      a.id,
      a.attempt,
      a.version,
      a.file!,
    ),
  ).toEqual(a.run);
  let outside = false;
  runner = async (...args) => {
    await instance.db.pool.query('SELECT 1');
    outside = true;
    return runDocument(...args);
  };
  const delivery = await process();
  expect(outside).toBe(true);
  expect(await row(a.run.id)).toMatchObject({
    status: 'ready',
    version: 2,
    engine: 'txt',
    page_count: 1,
  });
  expect((await row(a.run.id)).extracted_text).not.toContain('Verified file content');
  const view = await reviews.read(coordinator.token, client, a.id);
  expect(view.files[0].extraction).toMatchObject({
    status: 'ready',
    text: 'Verified file content',
  });
  expect(view.evidence).toHaveLength(1);
  expect((await reviews.read(member.token, client, a.id)).files).toEqual([]);
  expect(await readdir(path.join(dir, 'work'))).toEqual([]);
  await extractions.process(delivery);
  expect((await row(a.run.id)).version).toBe(2);
  await reviews.confirm(
    coordinator.token,
    coordinator.csrf,
    client,
    a.id,
    a.attempt,
    a.version,
    a.file!,
    'Verified file content',
    'Compared extracted text with original.',
  );
  expect((await reviews.read(coordinator.token, client, a.id)).evidence).toHaveLength(2);
  expect((await reviews.read(member.token, client, a.id)).approved).toBeNull();
});
it('denies unrelated actors, stale attempts, quarantined files and unattached evidence', async () => {
  const a = await submitted(true),
    b = await submitted(true);
  for (const actor of [member, admin, alternate])
    await expect(
      extractions.requestAssessment(
        actor.token,
        actor.csrf,
        client,
        a.id,
        a.attempt,
        a.version,
        a.file!,
      ),
    ).rejects.toThrow();
  await expect(
    extractions.requestAssessment(
      coordinator.token,
      coordinator.csrf,
      client,
      a.id,
      a.attempt,
      a.version + 1,
      a.file!,
    ),
  ).rejects.toMatchObject({ code: 'stale_review' });
  await expect(
    extractions.requestAssessment(
      coordinator.token,
      coordinator.csrf,
      client,
      a.id,
      a.attempt,
      a.version,
      b.file!,
    ),
  ).rejects.toMatchObject({ code: 'extraction_file' });
  await instance.db.pool.query("UPDATE evidence_files SET scan_status='quarantined' WHERE id=$1", [
    a.file,
  ]);
  await expect(
    extractions.requestAssessment(
      coordinator.token,
      coordinator.csrf,
      client,
      a.id,
      a.attempt,
      a.version,
      a.file!,
    ),
  ).rejects.toMatchObject({ code: 'extraction_file' });
});
it('preserves failed attempts and allows an explicit retry after tools become available', async () => {
  const a = await requested();
  runner = async () => {
    throw new Error('tool_unavailable');
  };
  await process();
  expect(await row(a.run.id)).toMatchObject({ status: 'failed', error_code: 'tool_unavailable' });
  expect(
    (await reviews.read(coordinator.token, client, a.id)).files[0].extraction?.error,
  ).toContain('enter findings manually');
  const retry = await extractions.requestAssessment(
    coordinator.token,
    coordinator.csrf,
    client,
    a.id,
    a.attempt,
    a.version,
    a.file!,
  );
  expect(retry.id).not.toBe(a.run.id);
  runner = runDocument;
  await process();
  expect(await row(retry.id)).toMatchObject({ status: 'ready', attempt: 2 });
});
it('rechecks source hash and scan state after parsing and never publishes stale text', async () => {
  for (const change of ['hash', 'scan']) {
    const a = await requested();
    runner = async (...args) => {
      const result = await runDocument(...args);
      if (change === 'hash') {
        const f = (
          await instance.db.pool.query('SELECT storage_key FROM evidence_files WHERE id=$1', [
            a.file,
          ])
        ).rows[0];
        await writeFile(files.file(f.storage_key), 'Changed after parsing');
      } else
        await instance.db.pool.query(
          "UPDATE evidence_files SET scan_status='rejected' WHERE id=$1",
          [a.file],
        );
      return result;
    };
    await process();
    expect(await row(a.run.id)).toMatchObject({
      status: 'failed',
      error_code: 'source_changed',
      extracted_text: null,
    });
  }
});
it('rechecks current reviewer authority and job lease before publishing', async () => {
  const a = await requested();
  const next = await job();
  runner = async (...args) => {
    await instance.db.pool.query(
      "UPDATE outbox_events SET lease_until=now()-interval '1 second' WHERE id=$1",
      [next.id],
    );
    return runDocument(...args);
  };
  await extractions.process(next);
  expect(await row(a.run.id)).toMatchObject({
    status: 'failed',
    error_code: 'interrupted',
    extracted_text: null,
  });
  const b = await requested();
  runner = async (...args) => {
    await instance.db.pool.query(
      'UPDATE client_sensitive_grants SET ends_at=now() WHERE organisation_id=$1 AND ends_at IS NULL',
      [client],
    );
    return runDocument(...args);
  };
  await process();
  expect(await row(b.run.id)).toMatchObject({
    status: 'failed',
    error_code: 'access_revoked',
    extracted_text: null,
  });
  await instance.db.pool.query(
    'UPDATE client_sensitive_grants SET ends_at=NULL WHERE organisation_id=$1',
    [client],
  );
});
it('recovers a dispatch gap, fences stale workers and requires a new request after interruption', async () => {
  const a = await requested();
  const missing = await job();
  await finish(instance.db, missing, 'failed');
  await extractions.recover();
  const recovered = await job();
  expect(recovered.payload.generation).toBe(2);
  const lease = randomUUID();
  await instance.db.pool.query(
    "UPDATE document_extractions SET status='running',lease=$1,started_at=now()-interval '4 minutes' WHERE id=$2",
    [lease, a.run.id],
  );
  await extractions.recover();
  expect(await row(a.run.id)).toMatchObject({ status: 'failed', error_code: 'interrupted' });
  await extractions.process(recovered);
  expect((await row(a.run.id)).extracted_text).toBeNull();
  await finish(instance.db, recovered, 'done');
  await extractions.recover();
  expect((await row(a.run.id)).dispatch_seq).toBe(2);
});

it('waits for a clean scan after admission and fences another runtime environment', async () => {
  const a = await requested(),
    next = await job();
  await expect(extractions.process({ ...next, environment: 'production' })).rejects.toMatchObject({
    code: 'environment_mismatch',
  });
  await instance.db.pool.query("UPDATE evidence_files SET scan_status='scanning' WHERE id=$1", [
    a.file,
  ]);
  let calls = 0;
  runner = async (...args) => {
    calls++;
    return runDocument(...args);
  };
  await extractions.process(next);
  await finish(instance.db, next, 'done');
  expect(calls).toBe(0);
  expect((await row(a.run.id)).status).toBe('queued');
  await extractions.recover();
  expect((await row(a.run.id)).dispatch_seq).toBe(1);
  await instance.db.pool.query("UPDATE evidence_files SET scan_status='clean' WHERE id=$1", [
    a.file,
  ]);
  await extractions.recover();
  await process();
  expect(calls).toBe(1);
  expect((await row(a.run.id)).status).toBe('ready');
});

import { Platform } from '../packages/domain/src/platform.js';

it('cleans a stale failed private work directory without restarting extraction', async () => {
  const a = await requested(),
    lease = randomUUID();
  const work = extractions.workdir(lease);
  await mkdir(work, { recursive: true });
  await writeFile(path.join(work, 'input'), 'Private synthetic working copy');
  await instance.db.pool.query(
    "UPDATE document_extractions SET status='failed',lease=$1,started_at=now()-interval '4 minutes' WHERE id=$2",
    [lease, a.run.id],
  );
  await extractions.recover();
  expect(await stat(work).catch(() => null)).toBeNull();
  expect(await row(a.run.id)).toMatchObject({ status: 'failed', lease: null });
});
it('cancels queued and running extraction on client suspension without revival', async () => {
  const a = await requested(),
    b = await requested(),
    platform = new Platform(auth);
  const state = (
    await instance.db.pool.query(
      'SELECT version FROM platform_client_states WHERE organisation_id=$1',
      [client],
    )
  ).rows[0];
  runner = async (...args) => {
    await platform.client(
      admin.token,
      admin.csrf,
      client,
      'Demo Client 1',
      state.version,
      'Suspend client during document processing',
      true,
    );
    return runDocument(...args);
  };
  await extractions.process(await job());
  for (const item of [a, b])
    expect(await row(item.run.id)).toMatchObject({
      status: 'failed',
      error_code: 'access_revoked',
      extracted_text: null,
    });
  const suspended = (
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
    suspended.version,
    'Reactivate without resuming document jobs',
    false,
  );
  await extractions.recover();
  expect((await row(b.run.id)).status).toBe('failed');
  expect(await readdir(path.join(dir, 'work'))).toEqual([]);
});

import { OnboardingDocuments } from '../packages/domain/src/onboarding-documents.js';
const documentFindings = {
  provider: 'Synthetic observer',
  date: '2026-01-01',
  scale: 'Not scored',
  kind: 'observed evidence',
  findings: 'Confirmed observed practice',
};
let onboardingSessionsRenewed = false;
async function onboardingDocument(clean = true) {
  if (!onboardingSessionsRenewed) {
    admin = await login('admin@example.invalid', 'Unique administrator passphrase');
    coordinator = await login('demo.1.2@example.invalid');
    member = await login('demo.1.3@example.invalid');
    const allocation = (
      await instance.db.pool.query(
        "SELECT id FROM coordinator_allocations WHERE member_membership_id=$1 AND kind='primary' AND ends_at IS NULL",
        [memberId],
      )
    ).rows[0].id;
    await instance.db.pool.query(
      "INSERT INTO client_sensitive_grants(id,organisation_id,environment,allocation_id,granted_by,reason) VALUES($1,$2,'test',$3,$4,'New explicit synthetic grant after suspension')",
      [randomUUID(), client, allocation, (await auth.context(admin.token)).user!.id],
    );
    onboardingSessionsRenewed = true;
  }

  for (const s of [admin, coordinator, member]) await tenancy.select(s.token, s.csrf, client);
  const enrolment = (
    await enrolments.create(admin.token, admin.csrf, client, {
      memberId,
      coordinatorId,
      groupId: team,
      title: 'Document onboarding',
      reason: 'Synthetic onboarding document verification',
    })
  ).id;
  const file = (
    await files.upload(
      coordinator.token,
      coordinator.csrf,
      client,
      enrolment,
      Buffer.from('Private onboarding findings text'),
      'findings.txt',
      'assessment',
    )
  ).id;
  if (clean)
    await instance.db.pool.query("UPDATE evidence_files SET scan_status='clean' WHERE id=$1", [
      file,
    ]);
  const service = new OnboardingDocuments(extractions);
  const run = await service.request(coordinator.token, coordinator.csrf, client, enrolment, file);
  return { enrolment, file, service, run };
}
it('saves encrypted onboarding review drafts and atomically confirms source-bound findings', async () => {
  const a = await onboardingDocument();
  await process();
  let view = await a.service.read(coordinator.token, client, a.enrolment, a.file);
  expect(view.run).toMatchObject({
    status: 'ready',
    version: 2,
    text: 'Private onboarding findings text',
  });
  await a.service.review(
    coordinator.token,
    coordinator.csrf,
    client,
    a.enrolment,
    a.run.id,
    { ...documentFindings, source: 'forged source', confirmed_by: 'forged' },
    2,
    0,
    false,
  );
  view = await a.service.read(coordinator.token, client, a.enrolment, a.file);
  expect(view.onboardingVersion).toBe(0);
  expect(view.run?.version).toBe(3);
  expect(view.run?.review.source).toContain('SHA-256');
  expect(view.run?.review.source).not.toContain('forged');
  expect(view.run?.review.confirmed_by).toBeUndefined();
  const stored = (
    await instance.db.pool.query('SELECT review_data FROM document_extractions WHERE id=$1', [
      a.run.id,
    ])
  ).rows[0];
  expect(stored.review_data).not.toContain(documentFindings.findings);
  const result = await a.service.review(
    coordinator.token,
    coordinator.csrf,
    client,
    a.enrolment,
    a.run.id,
    documentFindings,
    3,
    0,
    true,
  );
  expect(result).toMatchObject({ status: 'confirmed', version: 4, onboardingVersion: 1 });
  const onboarding = await a.service.onboarding.read(member.token, client, a.enrolment);
  expect(onboarding.data.assessment).toMatchObject({
    findings: documentFindings.findings,
    confirmed_by: coordinatorUser,
    extraction_id: a.run.id,
    extraction_version: 4,
  });
  expect(onboarding.data.assessment?.source_sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(
    (
      await instance.db.pool.query(
        'SELECT count(*)::int n FROM onboarding_versions WHERE enrolment_id=$1',
        [a.enrolment],
      )
    ).rows[0].n,
  ).toBe(1);
  await expect(
    a.service.review(
      coordinator.token,
      coordinator.csrf,
      client,
      a.enrolment,
      a.run.id,
      documentFindings,
      4,
      1,
      true,
    ),
  ).rejects.toMatchObject({ code: 'extraction_conflict' });
});
it('preserves the extraction review on stale onboarding and extraction versions', async () => {
  const a = await onboardingDocument();
  await process();
  await a.service.onboarding.save(
    member.token,
    member.csrf,
    client,
    a.enrolment,
    'profile',
    { current_role: 'Newer profile' },
    0,
  );
  await expect(
    a.service.review(
      coordinator.token,
      coordinator.csrf,
      client,
      a.enrolment,
      a.run.id,
      documentFindings,
      2,
      0,
      true,
    ),
  ).rejects.toMatchObject({ code: 'onboarding_conflict' });
  expect((await row(a.run.id)).version).toBe(2);
  expect((await row(a.run.id)).status).toBe('ready');
  await a.service.review(
    coordinator.token,
    coordinator.csrf,
    client,
    a.enrolment,
    a.run.id,
    documentFindings,
    2,
    0,
    false,
  );
  await expect(
    a.service.review(
      coordinator.token,
      coordinator.csrf,
      client,
      a.enrolment,
      a.run.id,
      documentFindings,
      2,
      1,
      true,
    ),
  ).rejects.toMatchObject({ code: 'extraction_conflict' });
  await a.service.review(
    coordinator.token,
    coordinator.csrf,
    client,
    a.enrolment,
    a.run.id,
    documentFindings,
    3,
    1,
    true,
  );
  expect((await a.service.onboarding.read(member.token, client, a.enrolment)).data.profile).toEqual(
    { current_role: 'Newer profile' },
  );
});
it('blocks source changes, private member reads and active onboarding replacement', async () => {
  const a = await onboardingDocument();
  await process();
  await expect(a.service.read(member.token, client, a.enrolment, a.file)).rejects.toMatchObject({
    status: 404,
  });
  await expect(
    a.service.review(
      member.token,
      member.csrf,
      client,
      a.enrolment,
      a.run.id,
      documentFindings,
      2,
      0,
      true,
    ),
  ).rejects.toMatchObject({ status: 403 });
  await instance.db.pool.query("UPDATE evidence_files SET scan_status='rejected' WHERE id=$1", [
    a.file,
  ]);
  const view = await a.service.read(coordinator.token, client, a.enrolment, a.file);
  expect(view.run?.text).toBeNull();
  expect(view.run?.review).toEqual({});
  expect(view.run?.error).toContain('source file changed');
  await expect(
    a.service.review(
      coordinator.token,
      coordinator.csrf,
      client,
      a.enrolment,
      a.run.id,
      documentFindings,
      2,
      0,
      true,
    ),
  ).rejects.toMatchObject({ code: 'source_changed' });
  await instance.db.pool.query("UPDATE enrolments SET status='active' WHERE id=$1", [a.enrolment]);
  await expect(
    a.service.request(coordinator.token, coordinator.csrf, client, a.enrolment, a.file),
  ).rejects.toMatchObject({ code: 'training_active' });
});
it('waits for onboarding scans and rejects mixing initial-assessment confirmation paths', async () => {
  const a = await onboardingDocument(false);
  expect(a.run.status).toBe('waiting_scan');
  await process();
  expect((await row(a.run.id)).status).toBe('waiting_scan');
  await instance.db.pool.query("UPDATE evidence_files SET scan_status='clean' WHERE id=$1", [
    a.file,
  ]);
  await extractions.recover();
  await process();
  expect((await row(a.run.id)).status).toBe('ready');
  const initial = await requested();
  await process();
  await expect(
    a.service.review(
      coordinator.token,
      coordinator.csrf,
      client,
      initial.enrolment,
      initial.run.id,
      documentFindings,
      2,
      0,
      true,
    ),
  ).rejects.toMatchObject({ status: 422 });
});

it('replays retention receipts to purge confirmed text while preserving immutable attribution', async () => {
  runner = runDocument;
  const a = await requested();
  await process();
  await reviews.confirm(
    coordinator.token,
    coordinator.csrf,
    client,
    a.id,
    a.attempt,
    a.version,
    a.file!,
    'Verified file content',
    'Confirmed before retention replay',
  );
  const confirmation = (
    await instance.db.pool.query(
      'SELECT * FROM assessment_file_confirmations WHERE evidence_file_id=$1',
      [a.file],
    )
  ).rows[0];
  await expect(
    instance.db.pool.query('UPDATE assessment_file_confirmations SET text=NULL WHERE id=$1', [
      confirmation.id,
    ]),
  ).rejects.toThrow('immutable');
  const file = (await instance.db.pool.query('SELECT * FROM evidence_files WHERE id=$1', [a.file]))
    .rows[0];
  await instance.db.pool.query(
    "INSERT INTO deletion_ledger(id,organisation_id,environment,kind,target_id,object_hash,policy_version) VALUES($1,$2,'test','evidence_file',$3,$4,'isolated-replay')",
    [randomUUID(), client, file.id, digest(file.storage_key)],
  );
  const ops = new Operations(files);
  expect(await ops.reapplyDeletions()).toBe(1);
  const purged = (
    await instance.db.pool.query('SELECT * FROM assessment_file_confirmations WHERE id=$1', [
      confirmation.id,
    ])
  ).rows[0];
  expect(purged).toEqual({ ...confirmation, text: null });
  const retainedView = await reviews.read(coordinator.token, client, a.id);
  expect(retainedView.files[0]).toMatchObject({
    status: 'deleted',
    extraction: { status: 'purged', text: null, warnings: [] },
  });
  expect(retainedView.evidence).toHaveLength(1);
  await expect(
    instance.db.pool.query(
      "UPDATE assessment_file_confirmations SET reason='changed' WHERE id=$1",
      [confirmation.id],
    ),
  ).rejects.toThrow('immutable');
  await expect(
    instance.db.pool.query("UPDATE assessment_file_confirmations SET text='restored' WHERE id=$1", [
      confirmation.id,
    ]),
  ).rejects.toThrow('immutable');
  expect(await ops.reapplyDeletions()).toBe(0);
});
