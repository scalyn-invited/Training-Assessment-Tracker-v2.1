import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rm, unlink, readdir } from 'node:fs/promises';
import path from 'node:path';
import { testDatabase } from './helpers.js';
import { RealisticDemo } from '../packages/domain/src/realistic-demo.js';
import { LocalDemoFixtures } from '../packages/domain/src/local-demo-fixtures.js';
import { Auth } from '../packages/domain/src/auth.js';
import { assertLocalFixtures } from '../packages/domain/src/demo-client.js';
let instance: Awaited<ReturnType<typeof testDatabase>>, service: RealisticDemo, root: string;
const roots: string[] = [],
  key = randomBytes(32);
async function workspace() {
  root = path.resolve('.runtime/realistic-demo-tests', randomUUID());
  roots.push(root);
  await mkdir(path.join(root, 'private'), { recursive: true });
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('TRAINING_AUTH_MODE', 'mock');
  vi.stubEnv('MOCK_IDENTITY_ENABLED', 'true');
  vi.stubEnv('TRAINING_ENVIRONMENT', 'test');
  vi.stubEnv('TRAINING_DEMO_ENABLED', 'true');
  vi.stubEnv('TRAINING_DEMO_ROOT', root);
  vi.stubEnv('PRIVATE_STORAGE_PATH', path.join(root, 'private'));
  vi.stubEnv('TRAINING_DEMO_DATABASE', path.join(root, 'private/pglite'));
  vi.stubEnv('PGLITE_PORT', '55439');
  vi.stubEnv('DATABASE_URL', '');
  vi.stubEnv('MIGRATION_DATABASE_URL', '');
  for (const name of [
    'AI_LIVE_ENABLED',
    'AI_ANTHROPIC_ENABLED',
    'AI_GEMINI_ENABLED',
    'SMTP_ENABLED',
    'ACCOUNT_MAIL_ENABLED',
    'RETENTION_APPROVED',
  ])
    vi.stubEnv(name, 'false');
  instance = await testDatabase();
  service = new RealisticDemo(instance.db, key, process.env.TRAINING_DEMO_DATABASE!, (stage) =>
    console.log(stage),
  );
}
beforeAll(workspace);
afterAll(async () => {
  await instance?.close();
  vi.unstubAllEnvs();
  for (const directory of roots) {
    if (
      !path.resolve(directory).startsWith(path.resolve('.runtime/realistic-demo-tests') + path.sep)
    )
      throw new Error('Unexpected test cleanup target');
    await rm(directory, { recursive: true, force: true });
  }
});
it('refuses unsafe configuration before changing records and keeps the local-password guard separate', async () => {
  const before = await service.snapshot();
  expect(() => assertLocalFixtures()).toThrow();
  for (const [name, value] of [
    ['TRAINING_DEMO_ENABLED', 'false'],
    ['TRAINING_AUTH_MODE', 'local_password'],
    ['AI_LIVE_ENABLED', 'true'],
    ['SMTP_ENABLED', 'true'],
    ['ACCOUNT_MAIL_ENABLED', 'true'],
    ['TRAINING_DEMO_DATABASE', 'wrong'],
    ['MIGRATION_DATABASE_URL', 'postgres://localhost/foreign'],
    ['PRIVATE_STORAGE_PATH', root],
  ]) {
    const original = process.env[name];
    process.env[name] = value;
    await expect(service.seed()).rejects.toThrow();
    process.env[name] = original;
  }
  expect(await service.snapshot()).toBe(before);
  expect(await readdir(root)).toEqual(['private']);
});
it('creates the mock catalogue through ordinary services and replays only the identical manifest, records and evidence', async () => {
  const result = await service.seed();
  console.log('Seed returned');
  expect(result.created).toBe(true);
  const db = instance.db,
    file = path.join(root, 'manifest.json'),
    original = await readFile(file, 'utf8');
  expect((await db.pool.query('SELECT id FROM users')).rowCount).toBe(30);
  expect((await db.pool.query('SELECT id FROM enrolments')).rowCount).toBe(21);
  expect((await db.pool.query("SELECT id FROM enrolments WHERE status='completed'")).rowCount).toBe(
    3,
  );
  expect(
    (await db.pool.query("SELECT id FROM role_assignments WHERE scope_type='platform'")).rowCount,
  ).toBe(0);
  expect(
    (await db.pool.query("SELECT id FROM identities WHERE issuer='urn:training:local'")).rowCount,
  ).toBe(0);
  expect((await db.pool.query('SELECT token_hash FROM sessions')).rowCount).toBe(0);
  console.log('Checking snapshot and replay');
  const snapshot = await service.snapshot();
  expect((await service.seed()).created).toBe(false);
  expect(await service.snapshot()).toBe(snapshot);
  for (const changed of [
    { status: 'building' },
    { ...result.manifest, source: '0'.repeat(64) },
    { ...result.manifest, version: 'changed' },
  ]) {
    await writeFile(file, JSON.stringify(changed));
    await expect(service.seed()).rejects.toMatchObject({ code: 'demo_changed' });
    await writeFile(file, original);
  }
  const user = (await db.pool.query('SELECT id,name FROM users u WHERE NOT EXISTS(SELECT 1 FROM enrolments e WHERE e.member_id=u.id) LIMIT 1')).rows[0];
  await db.pool.query("UPDATE users SET name='Changed fictional account' WHERE id=$1", [user.id]);
  await expect(service.seed()).rejects.toMatchObject({ code: 'demo_changed' });
  await db.pool.query('UPDATE users SET name=$1 WHERE id=$2', [user.name, user.id]);
  await db.pool.query('UPDATE users SET is_synthetic=false WHERE id=$1', [user.id]);
  await expect(service.seed()).rejects.toMatchObject({ code: 'demo_real_data' });
  await db.pool.query('UPDATE users SET is_synthetic=true WHERE id=$1', [user.id]);
  const storage = Object.keys(result.manifest.files)[0],
    evidence = path.join(root, 'private/evidence', storage),
    bytes = await readFile(evidence);
  await writeFile(evidence, 'changed fixture bytes');
  await expect(service.seed()).rejects.toMatchObject({ code: 'demo_evidence_changed' });
  await writeFile(evidence, bytes);
  await writeFile(path.join(root, 'seed.lock'), 'other-operation');
  await expect(service.seed()).rejects.toMatchObject({ code: 'demo_locked' });
  await unlink(path.join(root, 'seed.lock'));
  expect(await service.snapshot()).toBe(snapshot);
  expect((await service.seed()).created).toBe(false);
}, 600000);
it('extends only a complete fictional demo, keeps repeat invocations unchanged, and permits ordinary mock sign-in', async () => {
  const before = await service.snapshot();
  expect(await service.extendAdministrator(true)).toEqual({ created: false, checked: true });
  expect(await service.snapshot()).toBe(before);
  expect((await service.extendAdministrator()).created).toBe(true);
  console.log('Checking snapshot and replay');
  const snapshot = await service.snapshot();
  expect((await service.extendAdministrator()).created).toBe(false);
  expect(await service.snapshot()).toBe(snapshot);
  expect((await instance.db.pool.query('SELECT id FROM users')).rowCount).toBe(31);
  await expect(service.seed()).rejects.toMatchObject({ code: 'demo_changed' });
  const auth = new Auth(instance.db, key),
    options = await auth.signInOptions();
  const identity = options.identities.find((i) => i.name.includes('Fictional Global Admin'))!;
  expect(identity).toBeTruthy();
  const guest = await auth.context(),
    session = await auth.mockLogin(guest.token!, guest.csrf, identity.id);
  expect((await auth.context(session.token)).user).toMatchObject({
    id: RealisticDemo.administratorId,
    global_admin: true,
  });
  await instance.db.pool.query(
    "UPDATE role_assignments SET ends_at=now() WHERE user_id=$1 AND scope_type='platform'",
    [RealisticDemo.administratorId],
  );
  const changed = await service.snapshot();
  await expect(service.extendAdministrator()).rejects.toMatchObject({
    code: 'demo_extension_changed',
  });
  expect(await service.snapshot()).toBe(changed);
});
it('rolls back a failed generation and refuses the partial manifest without overwriting orphan evidence', async () => {
  await instance.close();
  await workspace();
  const original = LocalDemoFixtures.prototype.evidence;
  const fault = vi
    .spyOn(LocalDemoFixtures.prototype, 'evidence')
    .mockImplementationOnce(async function (this: LocalDemoFixtures, ...args) {
      await original.apply(this, args);
      throw new Error('Fixture interruption');
    });
  try {
    await expect(service.seed()).rejects.toThrow('Fixture interruption');
  } finally {
    fault.mockRestore();
  }
  expect((await instance.db.pool.query('SELECT id FROM users')).rowCount).toBe(0);
  const file = path.join(root, 'manifest.json'),
    manifest = await readFile(file, 'utf8'),
    files = await readdir(path.join(root, 'private/evidence'));
  expect(files).toHaveLength(2);
  expect(JSON.parse(manifest).status).toBe('building');
  await expect(service.seed()).rejects.toMatchObject({ code: 'demo_changed' });
  expect(await readFile(file, 'utf8')).toBe(manifest);
  expect(await readdir(path.join(root, 'private/evidence'))).toEqual(files);
}, 120000);
