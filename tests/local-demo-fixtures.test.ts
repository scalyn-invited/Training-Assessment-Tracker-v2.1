import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { testDatabase } from './helpers.js';
import { migrate } from '../packages/database/src/migrate.js';
import { InstallationDatabase } from '../packages/domain/src/installation-database.js';
import { LocalDemoFixtures } from '../packages/domain/src/local-demo-fixtures.js';
import { passwordHash, digest } from '../packages/domain/src/crypto.js';
import { Auth, type AuthUser } from '../packages/domain/src/auth.js';
import { Enrolments } from '../packages/domain/src/enrolments.js';
import { EvidenceFiles, type EvidenceFile } from '../packages/domain/src/evidence-files.js';
let instance: Awaited<ReturnType<typeof testDatabase>>,
  directory: string,
  fixtures: LocalDemoFixtures,
  hash: string;
const installation = randomUUID(),
  key = Buffer.alloc(32, 7);
beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'tracker-local-demo-'));
  instance = await testDatabase({ migrate: false });
  await new InstallationDatabase().claim(instance.db, {
    id: installation,
    mode: 'hosted',
    status: 'installing',
    key: key.toString('hex'),
    origin: 'https://setup.example.test',
    createdAt: Date.now(),
  });
  await migrate(instance.db);
  await instance.db.pool.query(
    "UPDATE training_installations SET stage='migrated' WHERE installation_id=$1",
    [installation],
  );
  fixtures = new LocalDemoFixtures(
    instance.db,
    key,
    directory,
    () => new Date('2026-11-13T01:00:00Z'),
  );
  hash = await passwordHash('Separate fictional fixture passphrase');
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await instance?.close();
  if (
    directory &&
    path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep) &&
    path.basename(directory).startsWith('tracker-local-demo-')
  )
    await rm(directory, { recursive: true, force: true });
});
it('refuses another installation, changed fixture version, unsafe runtime and an unowned existing account', async () => {
  await expect(fixtures.advance(randomUUID(), hash)).rejects.toMatchObject({
    code: 'fixture_installation',
  });
  await instance.db.pool.query("UPDATE training_installations SET fixture_version='other'");
  await expect(fixtures.advance(installation, hash)).rejects.toMatchObject({
    code: 'fixture_version',
  });
  await instance.db.pool.query('UPDATE training_installations SET fixture_version=null');
  vi.stubEnv('SMTP_ENABLED', 'true');
  await expect(fixtures.advance(installation, hash)).rejects.toMatchObject({
    code: 'demo_disabled',
  });
  vi.unstubAllEnvs();
  await instance.db.transaction(async (sql) => {
    await sql.query("INSERT INTO organisations(id,name) VALUES($1,'Preserved foreign client')", [
      randomUUID(),
    ]);
    // Failure inside the owned transaction must never seed a partial client.
  });
  await expect(fixtures.advance(installation, hash)).rejects.toMatchObject({
    code: 'fixture_nonempty',
  });
  expect((await instance.db.pool.query('SELECT name FROM organisations')).rows).toEqual([
    { name: 'Preserved foreign client' },
  ]);
  await instance.db.pool.query("DELETE FROM organisations WHERE name='Preserved foreign client'");
});
it('resumes all 25 stages, reuses unchanged orphan fixture bytes, and retains private evidence and departure history', async () => {
  for (let next = 1; next <= 3; next++)
    expect((await fixtures.advance(installation, hash)).next).toBe(next);
  const write = fixtures.evidence.bind(fixtures);
  fixtures.evidence = async (...args) => {
    await write(...args);
    throw new Error('Interrupted fixture file stage');
  };
  await expect(fixtures.advance(installation, hash)).rejects.toThrow(
    'Interrupted fixture file stage',
  );
  expect((await instance.db.pool.query('SELECT id FROM enrolments')).rowCount).toBe(0);
  expect(
    (await instance.db.pool.query('SELECT fixture_state FROM training_installations')).rows[0]
      .fixture_state.next,
  ).toBe(3);
  expect(await readdir(path.join(directory, 'evidence'))).toHaveLength(2);
  fixtures.evidence = write;
  let progress = await fixtures.advance(installation, hash);
  while (progress.next < 25) progress = await fixtures.advance(installation, hash);
  expect(progress.clients).toHaveLength(3);
  expect(progress.scenarios).toHaveLength(21);
  expect(Object.keys(progress.files)).toHaveLength(42);
  expect((await instance.db.pool.query('SELECT id FROM users')).rowCount).toBe(30);
  expect((await instance.db.pool.query('SELECT id FROM evidence_files')).rowCount).toBe(42);
  expect(
    (await instance.db.pool.query("SELECT id FROM enrolments WHERE status='completed'")).rowCount,
  ).toBe(3);
  expect((await instance.db.pool.query('SELECT token_hash FROM sessions')).rowCount).toBe(0);
  for (const [object, sha] of Object.entries(progress.files))
    expect(digest(await readFile(path.join(directory, 'evidence', object)))).toBe(sha);
  const db = instance.db,
    client = progress.clients[0],
    scenario = progress.scenarios[5],
    auth = new Auth(db, key),
    enrolments = new Enrolments(auth),
    files = new EvidenceFiles(enrolments, undefined, path.join(directory, 'evidence'), key);
  const member = (
    await db.pool.query<AuthUser>('SELECT * FROM users WHERE id=$1', [client.users[8]])
  ).rows[0];
  const evidence = (
    await db.pool.query<EvidenceFile>(
      'SELECT * FROM evidence_files WHERE enrolment_id=$1 ORDER BY purpose',
      [scenario.enrolment],
    )
  ).rows;
  expect(
    await files.canRead(
      db.pool,
      member,
      evidence.find((f) => f.purpose === 'evidence')!,
    ),
  ).toBe(true);
  expect(
    await files.canRead(
      db.pool,
      member,
      evidence.find((f) => f.purpose === 'assessment')!,
    ),
  ).toBe(false);
  const last = progress.clients[2];
  expect(
    (
      await db.pool.query('SELECT status FROM client_memberships WHERE id=$1', [
        last.memberships[3],
      ])
    ).rows[0].status,
  ).toBe('ended');
  expect(
    (await db.pool.query('SELECT id FROM enrolments WHERE member_id=$1', [last.users[3]])).rowCount,
  ).toBe(1);
  expect(
    (await db.pool.query('SELECT id FROM client_memberships WHERE user_id=$1', [client.users[3]]))
      .rowCount,
  ).toBe(2);
  expect(
    (
      await db.pool.query(
        'SELECT id FROM client_sensitive_grants WHERE ends_at IS NOT NULL AND id=ANY($1::uuid[])',
        [progress.clients.map((c) => c.grants[6])],
      )
    ).rowCount,
  ).toBe(3);
  expect(await fixtures.advance(installation, hash)).toEqual(progress);
  expect((await db.pool.query('SELECT id FROM users')).rowCount).toBe(30);
}, 600000);
