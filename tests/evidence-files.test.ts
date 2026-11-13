import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { testDatabase } from './helpers.js';
import { Auth } from '../packages/domain/src/auth.js';
import { Tenancy } from '../packages/domain/src/tenancy.js';
import { Enrolments } from '../packages/domain/src/enrolments.js';
import { EvidenceFiles } from '../packages/domain/src/evidence-files.js';
import { claim, finish } from '../packages/domain/src/outbox.js';
import type { Scanner } from '../packages/domain/src/file-scanner.js';
let instance: Awaited<ReturnType<typeof testDatabase>>,
  auth: Auth,
  tenancy: Tenancy,
  enrolments: Enrolments,
  dir: string;
let admin: { token: string; csrf: string },
  coordinator: { token: string; csrf: string },
  member: { token: string; csrf: string },
  otherMember: { token: string; csrf: string };
let client: string,
  other: string,
  memberId: string,
  reviewerId: string,
  team: string,
  record: string,
  coordinatorUser: string;
beforeAll(async () => {
  instance = await testDatabase();
  auth = new Auth(instance.db, randomBytes(32));
  tenancy = new Tenancy(auth);
  enrolments = new Enrolments(auth);
  dir = await mkdtemp(path.join(tmpdir(), 'tracker-evidence-'));
  const g = await auth.context();
  await auth.setup(g.token!, g.csrf, {
    name: 'Admin',
    email: 'admin@example.invalid',
    password: 'Unique administrator passphrase',
    demoPassword: 'Separate demonstration password',
  });
  async function login(email: string, password = 'Separate demonstration password') {
    const guest = await auth.context();
    return auth.login(guest.token!, guest.csrf, email, password);
  }
  admin = await login('admin@example.invalid', 'Unique administrator passphrase');
  coordinator = await login('demo.1.2@example.invalid');
  member = await login('demo.1.3@example.invalid');
  otherMember = await login('demo.1.4@example.invalid');
  const clients = await tenancy.choices(admin.token);
  client = clients[0].id;
  other = clients[1].id;
  for (const s of [admin, coordinator, member, otherMember])
    await tenancy.select(s.token, s.csrf, client);
  const rows = (
    await instance.db.pool.query(
      'SELECT cm.id,u.id user_id,u.email FROM client_memberships cm JOIN users u ON u.id=cm.user_id WHERE cm.organisation_id=$1',
      [client],
    )
  ).rows;
  memberId = rows.find((r) => r.email === 'demo.1.3@example.invalid').id;
  reviewerId = rows.find((r) => r.email === 'demo.1.2@example.invalid').id;
  coordinatorUser = rows.find((r) => r.email === 'demo.1.2@example.invalid').user_id;
  team = (await instance.db.pool.query('SELECT id FROM groups WHERE organisation_id=$1', [client]))
    .rows[0].id;
  record = (
    await enrolments.create(admin.token, admin.csrf, client, {
      memberId,
      coordinatorId: reviewerId,
      groupId: team,
      title: 'Evidence programme',
      reason: 'Synthetic file verification',
    })
  ).id;
});
afterAll(async () => {
  await instance?.close();
  if (dir) await rm(dir, { recursive: true, force: true });
});
function service(scanner: Scanner = async () => 'clean') {
  return new EvidenceFiles(enrolments, scanner, dir);
}
async function upload(
  files = service(),
  purpose: 'evidence' | 'assessment' = 'evidence',
  actor = member,
) {
  return files.upload(
    actor.token,
    actor.csrf,
    client,
    record,
    Buffer.from('Private supporting evidence'),
    'notes.txt',
    purpose,
  );
}
async function run(files: EvidenceFiles) {
  const job = await claim(instance.db, ['evidence.scan']);
  expect(job?.kind).toBe('evidence.scan');
  await files.process(job!);
  await finish(instance.db, job!, 'done');
}
it('requires scoped member or primary sensitive authority for uploading', async () => {
  const files = service();
  await expect(upload(files, 'evidence', admin)).rejects.toMatchObject({ status: 404 });
  await expect(upload(files, 'evidence', otherMember)).rejects.toMatchObject({ status: 404 });
  await expect(upload(files, 'evidence', coordinator)).rejects.toMatchObject({ status: 403 });
  await expect(
    files.upload(
      member.token,
      member.csrf,
      other,
      record,
      Buffer.from('text'),
      'notes.txt',
      'evidence',
    ),
  ).rejects.toMatchObject({ status: 403 });
});
it('permits own supporting evidence only after scan success, with private projections', async () => {
  const files = service(),
    item = await upload(files);
  await expect(files.download(member.token, item.id)).rejects.toMatchObject({ status: 409 });
  expect((await files.list(member.token, client, record)).files[0]).toMatchObject({
    id: item.id,
    status: 'quarantined',
  });
  expect((await files.list(member.token, client, record)).files[0]).not.toHaveProperty(
    'storage_key',
  );
  await run(files);
  expect((await files.download(member.token, item.id)).bytes.toString()).toBe(
    'Private supporting evidence',
  );
  await expect(files.download(otherMember.token, item.id)).rejects.toMatchObject({ status: 404 });
  await expect(files.download(admin.token, item.id)).rejects.toMatchObject({ status: 404 });
  const row = (
    await instance.db.pool.query('SELECT storage_key FROM evidence_files WHERE id=$1', [item.id])
  ).rows[0];
  await writeFile(files.file(row.storage_key), 'changed');
  await expect(files.download(member.token, item.id)).rejects.toMatchObject({ status: 404 });
});
it('keeps assessment-purpose and third-party sensitive files hidden from the member', async () => {
  const files = service(),
    assessment = await upload(files, 'assessment');
  await run(files);
  await expect(files.download(member.token, assessment.id)).rejects.toMatchObject({ status: 404 });
  const allocation = (
    await instance.db.pool.query(
      "SELECT id FROM coordinator_allocations WHERE member_membership_id=$1 AND kind='primary' AND ends_at IS NULL",
      [memberId],
    )
  ).rows[0].id;
  const actor = (await auth.context(admin.token)).user!;
  await instance.db.pool.query(
    "INSERT INTO client_sensitive_grants(id,organisation_id,environment,allocation_id,granted_by,reason) VALUES($1,$2,'test',$3,$4,'Independent test grant')",
    [randomUUID(), client, allocation, actor.id],
  );
  expect((await files.download(coordinator.token, assessment.id)).bytes.length).toBeGreaterThan(0);
  const thirdParty = await upload(files, 'evidence', coordinator);
  await run(files);
  await expect(files.download(member.token, thirdParty.id)).rejects.toMatchObject({ status: 404 });
  expect(
    (await files.list(member.token, client, record)).files.some(
      (f) => f.id === assessment.id || f.id === thirdParty.id,
    ),
  ).toBe(false);
});
it('preserves quarantine after scanner failures and rejects infected or changed files', async () => {
  const unavailable = service(async () => 'unavailable'),
    pending = await upload(unavailable);
  await run(unavailable);
  expect(
    (await unavailable.list(member.token, client, record)).files.find((f) => f.id === pending.id)
      ?.status,
  ).toBe('quarantined');
  const rejected = service(async () => 'rejected'),
    bad = await upload(rejected);
  await run(rejected);
  expect(
    (await rejected.list(member.token, client, record)).files.find((f) => f.id === bad.id)?.status,
  ).toBe('rejected');
  const changing = service(async (file) => {
      await writeFile(file, 'changed');
      return 'clean';
    }),
    changed = await upload(changing);
  await run(changing);
  expect(
    (await changing.list(member.token, client, record)).files.find((f) => f.id === changed.id)
      ?.status,
  ).toBe('rejected');
});
it('fences interrupted workers and recovers only when scanner configuration is present', async () => {
  const files = service(async () => {
    await instance.db.pool.query(
      "UPDATE outbox_events SET lease_until=now()-interval '1 second' WHERE status='processing'",
    );
    return 'clean';
  });
  const item = await upload(files),
    job = await claim(instance.db, ['evidence.scan']);
  await files.process(job!);
  expect(
    (await instance.db.pool.query('SELECT scan_status FROM evidence_files WHERE id=$1', [item.id]))
      .rows[0].scan_status,
  ).toBe('scanning');
  await instance.db.pool.query(
    "UPDATE evidence_files SET updated_at=now()-interval '4 minutes' WHERE id=$1",
    [item.id],
  );
  const previous = process.env.CLAMSCAN_PATH;
  process.env.CLAMSCAN_PATH = process.execPath;
  try {
    await files.recover();
  } finally {
    if (previous === undefined) delete process.env.CLAMSCAN_PATH;
    else process.env.CLAMSCAN_PATH = previous;
  }
  // Recovery also admits earlier unavailable uploads. Drain the bounded synthetic queue.
  for (let i = 0; i < 5; i++) {
    const next = await claim(instance.db, ['evidence.scan']);
    if (!next) break;
    await service().process(next);
    await finish(instance.db, next, 'done');
  }
  expect(
    (await instance.db.pool.query('SELECT scan_status FROM evidence_files WHERE id=$1', [item.id]))
      .rows[0].scan_status,
  ).toBe('clean');
  await expect(files.process({ ...job!, environment: 'production' })).rejects.toMatchObject({
    status: 403,
  });
});
it('rechecks client suspension before publishing a scanner result', async () => {
  const files = service(async () => {
    await instance.db.pool.query(
      'UPDATE platform_client_states SET suspended=true WHERE organisation_id=$1',
      [client],
    );
    return 'clean';
  });
  const item = await upload(files);
  await run(files);
  expect(
    (await instance.db.pool.query('SELECT scan_status FROM evidence_files WHERE id=$1', [item.id]))
      .rows[0].scan_status,
  ).toBe('quarantined');
  await expect(files.download(member.token, item.id)).rejects.toMatchObject({ status: 404 });
});
