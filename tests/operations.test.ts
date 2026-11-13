import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Operations } from '../packages/domain/src/operations.js';
import { digest } from '../packages/domain/src/crypto.js';
import { beforeAll, afterAll, afterEach, it, expect, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile, readFile, mkdir, unlink, rmdir } from 'node:fs/promises';
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

afterEach(() => vi.unstubAllEnvs());
const operations = () => new Operations(service());
async function oldFile() {
  const result = await upload();
  await instance.db.pool.query(
    "UPDATE evidence_files SET created_at=now()-interval '25 months',scan_status='clean' WHERE id=$1",
    [result.id],
  );
  return (await instance.db.pool.query('SELECT * FROM evidence_files WHERE id=$1', [result.id]))
    .rows[0];
}
it('reports only operational metadata and stale components', async () => {
  const first = await operations().report();
  expect(first.stale_components).toEqual(['worker', 'scheduler']);
  expect(first.launch_ready).toBe(false);
  expect(JSON.stringify(first)).not.toMatch(/Private supporting evidence|password|token_hash/);
  await operations().heartbeat('worker');
  await operations().heartbeat('scheduler');
  expect((await operations().report()).stale_components).toEqual([]);
  await instance.db.pool.query(
    "UPDATE operational_heartbeats SET seen_at=now()-interval '6 minutes' WHERE component='worker'",
  );
  expect((await operations().report()).stale_components).toEqual(['worker']);
});
it('defaults to dry-run and requires explicit approval before durable deletion', async () => {
  const file = await oldFile();
  expect(await operations().retain()).toMatchObject({ mode: 'dry_run', eligible_files: 1 });
  expect((await instance.db.pool.query('SELECT id FROM deletion_ledger')).rowCount).toBe(0);
  await expect(operations().retain(true)).rejects.toMatchObject({ status: 409 });
  expect(await readFile(service().file(file.storage_key), 'utf8')).toBe(
    'Private supporting evidence',
  );
  vi.stubEnv('RETENTION_APPROVED', 'true');
  expect(await operations().retain(true)).toMatchObject({ mode: 'apply', eligible_files: 1 });
  await expect(readFile(service().file(file.storage_key))).rejects.toMatchObject({
    code: 'ENOENT',
  });
  expect(
    (
      await instance.db.pool.query(
        'SELECT scan_status,bytes,original_name FROM evidence_files WHERE id=$1',
        [file.id],
      )
    ).rows[0],
  ).toMatchObject({
    scan_status: 'deleted',
    bytes: '0',
    original_name: '[removed under retention policy]',
  });
  await expect(
    instance.db.pool.query(
      "UPDATE deletion_ledger SET policy_version='changed' WHERE target_id=$1",
      [file.id],
    ),
  ).rejects.toThrow('immutable');
  await expect(service().download(member.token, file.id)).rejects.toMatchObject({ status: 409 });
});
it('replays restored objects, skips changed keys and redacts extraction drafts', async () => {
  const file = await oldFile();
  const extraction = randomUUID();
  await instance.db.pool.query(
    "INSERT INTO document_extractions(id,organisation_id,environment,enrolment_id,evidence_file_id,actor_id,attempt,status,source_hash,extracted_text,review_data,warnings) VALUES($1,$2,'test',$3,$4,$5,1,'ready',$6,'private extracted text','private review','[\"private warning\"]')",
    [extraction, client, record, file.id, coordinatorUser, file.sha256],
  );
  vi.stubEnv('RETENTION_APPROVED', 'true');
  await operations().retain(true);
  expect(
    (
      await instance.db.pool.query(
        'SELECT status,extracted_text,review_data,warnings FROM document_extractions WHERE id=$1',
        [extraction],
      )
    ).rows[0],
  ).toEqual({ status: 'purged', extracted_text: null, review_data: null, warnings: null });
  await writeFile(service().file(file.storage_key), 'Restored private content');
  expect(await operations().reapplyDeletions()).toBe(1);
  expect(await operations().reapplyDeletions()).toBe(0);
  const changed = randomUUID();
  await instance.db.pool.query('UPDATE evidence_files SET storage_key=$1 WHERE id=$2', [
    changed,
    file.id,
  ]);
  await writeFile(service().file(changed), 'Different object');
  expect(await operations().reapplyDeletions()).toBe(0);
  expect(await readFile(service().file(changed), 'utf8')).toBe('Different object');
});
it('preserves the durable receipt when physical removal fails and succeeds on replay', async () => {
  const file = await oldFile();
  await unlink(service().file(file.storage_key));
  await mkdir(service().file(file.storage_key));
  vi.stubEnv('RETENTION_APPROVED', 'true');
  await expect(operations().retain(true)).rejects.toMatchObject({
    status: 503,
    code: 'private_removal_failed',
  });
  expect(
    (await instance.db.pool.query('SELECT id FROM deletion_ledger WHERE target_id=$1', [file.id]))
      .rowCount,
  ).toBe(1);
  expect(
    (await instance.db.pool.query('SELECT scan_status FROM evidence_files WHERE id=$1', [file.id]))
      .rows[0].scan_status,
  ).toBe('deleted');
  await rmdir(service().file(file.storage_key));
  await writeFile(service().file(file.storage_key), 'Restored file');
  expect(await operations().reapplyDeletions()).toBe(1);
});
it('requires scoped administrator authority and preserves held evidence', async () => {
  const file = await oldFile();
  await expect(
    operations().hold(member.token, member.csrf, client, record, 'Preserve for open review'),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    operations().hold(admin.token, admin.csrf, other, record, 'Preserve for open review'),
  ).rejects.toMatchObject({ status: 403 });
  await operations().hold(admin.token, admin.csrf, client, record, 'Preserve for open review');
  vi.stubEnv('RETENTION_APPROVED', 'true');
  expect(await operations().retain(true)).toMatchObject({ eligible_files: 0, held_enrolments: 1 });
  expect(await readFile(service().file(file.storage_key), 'utf8')).toBe(
    'Private supporting evidence',
  );
});
it('prunes only old terminal AI traces outside active holds, keeping accounting and metadata', async () => {
  const runs: Record<string, string> = {};
  // Temporarily release the prior hold to isolate pruning eligibility.
  await instance.db.pool.query('UPDATE legal_holds SET released_at=now()');
  for (const status of ['complete', 'failed', 'ambiguous', 'running', 'queued']) {
    const id = randomUUID();
    runs[status] = id;
    await instance.db.pool.query(
      "INSERT INTO ai_runs(id,organisation_id,environment,enrolment_id,actor_id,idempotency_key,payload_hash,task,subject_id,status,configuration,task_input,feedback,reserved,spent,updated_at) VALUES($1::uuid,$2,'test',$3,$4,$1::text,'hash','grade_submission',$1::uuid,$5,'{}','private input','private feedback',10,7,now()-interval '31 days')",
      [id, client, record, coordinatorUser, status],
    );
    await instance.db.pool.query(
      "INSERT INTO ai_blocks(id,organisation_id,environment,ai_run_id,block_index,status,output) VALUES($1,$2,'test',$3,1,$4,'private output')",
      [randomUUID(), client, id, status],
    );
  }
  await operations().hold(admin.token, admin.csrf, client, record, 'Keep traces for review');
  expect(await operations().pruneAi()).toBe(0);
  await instance.db.pool.query('UPDATE legal_holds SET released_at=now()');
  expect(await operations().pruneAi()).toBe(2);
  for (const [status, id] of Object.entries(runs)) {
    const run = (
      await instance.db.pool.query(
        'SELECT task_input,feedback,reserved,spent,status FROM ai_runs WHERE id=$1',
        [id],
      )
    ).rows[0];
    expect(run).toMatchObject({ reserved: '10', spent: '7', status });
    expect(run.task_input).toBe(['complete', 'failed'].includes(status) ? null : 'private input');
    expect(run.feedback).toBe(['complete', 'failed'].includes(status) ? null : 'private feedback');
  }
});

it('runs metadata and retention CLI commands against the isolated database', async () => {
  const run = async (...args: string[]) =>
    promisify(execFile)(process.execPath, ['--import', 'tsx', 'scripts/operations.ts', ...args], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL: '',
        PGLITE_PORT: '55439',
        PRIVATE_STORAGE_PATH: dir,
        APP_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
        RETENTION_APPROVED: 'false',
      },
      timeout: 15000,
    });
  await operations().heartbeat('worker');
  expect((await run('heartbeat')).stdout).toContain('Scheduler heartbeat recorded');
  const report = JSON.parse((await run('health')).stdout);
  expect(report).toMatchObject({ database: 'ok', launch_ready: false, stale_components: [] });
  expect(JSON.parse((await run('retention')).stdout).mode).toBe('dry_run');
  await expect(run('retention', '--apply')).rejects.toMatchObject({ code: 1 });
  expect((await run('reapply-deletions')).stdout).toContain('Private objects removed: 0');
  expect((await run('ai-prune')).stdout).toContain('Terminal AI traces pruned:');
  await expect(run('retention', '--unknown')).rejects.toMatchObject({ code: 1 });
});
