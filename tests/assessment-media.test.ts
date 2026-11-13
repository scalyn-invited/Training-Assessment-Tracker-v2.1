import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { testDatabase } from './helpers.js';
import { Auth } from '../packages/domain/src/auth.js';
import { Tenancy } from '../packages/domain/src/tenancy.js';
import { AssessmentDefinitions } from '../packages/domain/src/assessment-definitions.js';
import { AssessmentMedia } from '../packages/domain/src/assessment-media.js';
import { claim, finish } from '../packages/domain/src/outbox.js';
import type { Scanner } from '../packages/domain/src/file-scanner.js';
let instance: Awaited<ReturnType<typeof testDatabase>>,
  auth: Auth,
  definitions: AssessmentDefinitions,
  directory: string,
  client: string,
  other: string;
let coordinator: { token: string; csrf: string },
  member: { token: string; csrf: string },
  admin: { token: string; csrf: string };
let png: Buffer;
beforeAll(async () => {
  instance = await testDatabase();
  const key = randomBytes(32);
  auth = new Auth(instance.db, key);
  definitions = new AssessmentDefinitions(auth, key);
  directory = await mkdtemp(path.join(tmpdir(), 'tracker-media-'));
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
  const tenancy = new Tenancy(auth);
  const clients = await tenancy.choices(admin.token);
  client = clients[0].id;
  other = clients[1].id;
  for (const s of [admin, coordinator, member]) await tenancy.select(s.token, s.csrf, client);
  png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#123456' } })
    .png()
    .toBuffer();
});
afterAll(async () => {
  await instance?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});
function service(scanner: Scanner = async () => 'clean') {
  return new AssessmentMedia(definitions, scanner, directory);
}
async function upload(media = service()) {
  return media.upload(coordinator.token, coordinator.csrf, client, png, 'image.png');
}
async function run(media: AssessmentMedia) {
  const job = await claim(instance.db, ['assessment.image.scan']);
  expect(job?.kind).toBe('assessment.image.scan');
  await media.process(job!);
  await finish(instance.db, job!, 'done');
  return job!;
}
it('validates bytes and bounds after enforcing current author authority', async () => {
  const media = service();
  for (const s of [member, admin])
    await expect(media.upload(s.token, s.csrf, client, png, 'image.png')).rejects.toMatchObject({
      status: 403,
    });
  await expect(
    media.upload(coordinator.token, coordinator.csrf, other, png, 'image.png'),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    media.upload(
      coordinator.token,
      coordinator.csrf,
      client,
      Buffer.from('not an image'),
      'image.png',
    ),
  ).rejects.toMatchObject({ status: 422 });
  await expect(
    media.upload(coordinator.token, coordinator.csrf, client, png, 'image.svg'),
  ).rejects.toMatchObject({ status: 422 });
  await expect(
    media.upload(
      coordinator.token,
      coordinator.csrf,
      client,
      Buffer.alloc(2 * 1024 * 1024 + 1),
      'image.png',
    ),
  ).rejects.toMatchObject({ status: 422 });
});
it('quarantines uploads, denies premature reads and publishes only scanned re-encoded images', async () => {
  const media = service();
  const item = await upload(media);
  expect((await media.status(coordinator.token, item.id)).status).toBe('quarantined');
  await expect(media.download(coordinator.token, item.id)).rejects.toMatchObject({ status: 404 });
  await expect(media.status(member.token, item.id)).rejects.toMatchObject({ status: 403 });
  await run(media);
  expect((await media.status(coordinator.token, item.id)).status).toBe('ready');
  const output = await media.download(coordinator.token, item.id);
  expect((await sharp(output).metadata()).format).toBe('png');
  await expect(media.retry(coordinator.token, coordinator.csrf, item.id)).rejects.toMatchObject({
    status: 409,
  });
  const row = (
    await instance.db.pool.query('SELECT path FROM assessment_media WHERE id=$1', [item.id])
  ).rows[0];
  await writeFile(path.join(directory, row.path), 'tampered');
  await expect(media.download(coordinator.token, item.id)).rejects.toMatchObject({ status: 404 });
});
it('fails closed on unavailable scanners, permits explicit retry and rejects infected files', async () => {
  const unavailable = service(async () => 'unavailable'),
    item = await upload(unavailable);
  await run(unavailable);
  expect((await unavailable.status(coordinator.token, item.id)).status).toBe('unavailable');
  await unavailable.retry(coordinator.token, coordinator.csrf, item.id);
  await run(service());
  expect((await unavailable.status(coordinator.token, item.id)).status).toBe('ready');
  const rejected = service(async () => 'rejected'),
    bad = await upload(rejected);
  await run(rejected);
  expect((await rejected.status(coordinator.token, bad.id)).status).toBe('rejected');
  await expect(rejected.retry(coordinator.token, coordinator.csrf, bad.id)).rejects.toMatchObject({
    status: 409,
  });
});
it('detects changed bytes during scanning and fences stale worker completion', async () => {
  const changing = service(async (file) => {
    await writeFile(file, 'changed');
    return 'clean';
  });
  const item = await upload(changing);
  await run(changing);
  expect((await changing.status(coordinator.token, item.id)).status).toBe('rejected');
  const stale = service(async () => {
    await instance.db.pool.query(
      "UPDATE outbox_events SET lease_until=now()-interval '1 second' WHERE status='processing'",
    );
    return 'clean';
  });
  const pending = await upload(stale);
  const job = await claim(instance.db, ['assessment.image.scan']);
  await stale.process(job!);
  expect((await stale.status(coordinator.token, pending.id)).status).toBe('scanning');
  await instance.db.pool.query(
    "UPDATE assessment_media SET updated_at=now()-interval '4 minutes' WHERE id=$1",
    [pending.id],
  );
  expect((await stale.status(coordinator.token, pending.id)).status).toBe('unavailable');
  await stale.retry(coordinator.token, coordinator.csrf, pending.id);
  await run(service());
  expect((await stale.status(coordinator.token, pending.id)).status).toBe('ready');
});
it('does not process jobs from another runtime environment', async () => {
  const media = service(),
    item = await upload(media),
    job = await claim(instance.db, ['assessment.image.scan']);
  await expect(media.process({ ...job!, environment: 'production' })).rejects.toMatchObject({
    status: 403,
  });
  expect((await media.status(coordinator.token, item.id)).status).toBe('quarantined');
  await media.process(job!);
  await finish(instance.db, job!, 'done');
});
it('rechecks author revocation after scanner execution before publishing', async () => {
  const media = service(async () => {
    await instance.db.pool.query(
      "UPDATE role_assignments SET ends_at=now() WHERE organisation_id=$1 AND role='coordinator' AND user_id=(SELECT id FROM users WHERE email='demo.1.2@example.invalid')",
      [client],
    );
    return 'clean';
  });
  const item = await upload(media);
  await run(media);
  expect(
    (await instance.db.pool.query('SELECT status FROM assessment_media WHERE id=$1', [item.id]))
      .rows[0].status,
  ).toBe('unavailable');
  await expect(media.download(coordinator.token, item.id)).rejects.toMatchObject({ status: 404 });
});
