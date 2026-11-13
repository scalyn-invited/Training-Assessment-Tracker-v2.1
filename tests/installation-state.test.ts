import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { InstallationState } from '../packages/domain/src/installation-state.js';
let root: string, store: InstallationState, now: number;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'tracker-install-state-'));
  now = Date.now();
  store = new InstallationState(root, () => now);
});
afterEach(async () => {
  if (
    root &&
    path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep) &&
    path.basename(root).startsWith('tracker-install-state-')
  )
    await rm(root, { recursive: true, force: true });
});
it('requires exact HTTPS origin and preserves existing configuration or private data', async () => {
  for (const origin of [
    'http://setup.example.test',
    'https://setup.example.test/path',
    'https://user:password@setup.example.test',
    'https://setup.example.test?query=true',
  ])
    await expect(store.initialize(origin, {})).rejects.toMatchObject({ status: 422 });
  await expect(
    store.initialize('https://setup.example.test', { APP_ENCRYPTION_KEY: 'existing' }),
  ).rejects.toMatchObject({ status: 409 });
  await writeFile(
    path.join(root, '.env'),
    'TRAINING_INSTALL_STATE=pending\nexport APP_ENCRYPTION_KEY = "existing"\n',
  );
  await expect(store.initialize('https://setup.example.test', {})).rejects.toMatchObject({
    status: 409,
  });
  await writeFile(path.join(root, '.env'), 'UNRELATED=preserve');
  await expect(store.initialize('https://setup.example.test', {})).rejects.toMatchObject({
    status: 409,
  });
  expect(await readFile(path.join(root, '.env'), 'utf8')).toBe('UNRELATED=preserve');
  await writeFile(path.join(root, '.env'), 'TRAINING_INSTALL_STATE=pending\n');
  await mkdir(path.join(root, '.runtime', 'private'), { recursive: true });
  await writeFile(path.join(root, '.runtime', 'private', 'existing.txt'), 'keep');
  await expect(store.initialize('https://setup.example.test', {})).rejects.toMatchObject({
    status: 409,
  });
});
it('issues hashed expiring tokens and consumes them into a rotated encrypted CSRF session', async () => {
  const state = await store.initialize('https://setup.example.test', {}),
    token = await store.issueToken(),
    guest = await store.session();
  expect(await readFile(path.join(store.directory, 'state.json'), 'utf8')).not.toContain(token);
  await expect(store.exchange(guest.token, 'wrong', token)).rejects.toMatchObject({ status: 403 });
  const owner = await store.exchange(guest.token, guest.value.csrf, token);
  expect(owner.token).not.toBe(guest.token);
  expect(owner.csrf).not.toBe(guest.value.csrf);
  const current = await store.verified(owner.token, owner.csrf);
  expect(current.value.step).toBe('requirements');
  expect((await store.read())?.tokenHash).toBeUndefined();
  const nextGuest = await store.session();
  await expect(store.exchange(nextGuest.token, nextGuest.value.csrf, token)).rejects.toMatchObject({
    status: 403,
  });
  current.value.database = {
    host: 'localhost',
    port: 5432,
    database: 'training',
    username: 'operator',
    password: 'private database value',
  };
  await store.saveSession(owner.token, current.value, state);
  const bytes = await readFile(store.sessionPath(owner.token), 'utf8');
  expect(bytes).not.toContain('private database value');
  expect(bytes).not.toContain(owner.csrf);
  expect((await store.verified(owner.token, owner.csrf)).value.database?.password).toBe(
    'private database value',
  );
});
it('regenerated tokens revoke the previous owner and expired tokens or sessions cannot resume', async () => {
  await store.initialize('https://setup.example.test', {});
  const token = await store.issueToken(),
    guest = await store.session();
  const owner = await store.exchange(guest.token, guest.value.csrf, token);
  const next = await store.issueToken();
  await expect(store.verified(owner.token, owner.csrf)).rejects.toMatchObject({ status: 403 });
  const newGuest = await store.session();
  now += 3600001;
  await expect(store.exchange(newGuest.token, newGuest.value.csrf, next)).rejects.toMatchObject({
    status: 401,
  });
  const fresh = await store.session();
  await expect(store.exchange(fresh.token, fresh.value.csrf, next)).rejects.toMatchObject({
    status: 403,
  });
});
it('rejects concurrent writers and recovers only a demonstrably exited process lock', async () => {
  await store.initialize('https://setup.example.test', {});
  await store.locked(async () => {
    await expect(store.issueToken()).rejects.toMatchObject({
      status: 409,
      code: 'installation_locked',
    });
  });
  const exited = spawnSync(process.execPath, ['-e', '']);
  expect(exited.status).toBe(0);
  await writeFile(
    path.join(store.directory, 'installation.lock'),
    JSON.stringify({ pid: exited.pid, nonce: 'exited' }),
  );
  expect(await store.issueToken()).toHaveLength(64);
});
it('closes completed setup and refuses damaged state', async () => {
  const state = await store.initialize('https://setup.example.test', {});
  state.status = 'installed';
  await store.write(state);
  await expect(store.issueToken()).rejects.toMatchObject({ status: 409 });
  await expect(store.session()).rejects.toMatchObject({ status: 404 });
  await expect(store.initialize('https://setup.example.test', {})).rejects.toMatchObject({
    status: 409,
  });
  await writeFile(path.join(store.directory, 'state.json'), '{broken');
  await expect(store.read()).rejects.toMatchObject({ status: 503 });
});
