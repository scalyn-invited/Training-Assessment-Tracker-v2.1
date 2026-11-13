import { beforeEach, afterEach, it, expect } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { InstallationState } from '../packages/domain/src/installation-state.js';
import { prepareLocalUpgrade } from '../packages/domain/src/local-upgrade.js';
let root: string, store: InstallationState;
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'tracker-local-upgrade-'));
  store = new InstallationState(root);
});
afterEach(async () => {
  if (
    root &&
    path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep) &&
    path.basename(root).startsWith('tracker-local-upgrade-')
  )
    await rm(root, { recursive: true, force: true });
});
it('preserves exact legacy configuration, key and database bytes and requires the expiring private token', async () => {
  const original = 'APP_ORIGIN=http://localhost:3100\nUNCHANGED=preserved\nNODE_ENV=production\n';
  await writeFile(path.join(root, '.env'), original);
  const old = path.join(root, '.runtime/private');
  await mkdir(path.join(old, 'pglite'), { recursive: true });
  await writeFile(path.join(old, 'encryption.key'), Buffer.alloc(32, 9));
  await writeFile(path.join(old, 'pglite', 'legacy.fixture'), 'preserved database bytes');
  const token = await prepareLocalUpgrade(store, 'http://localhost:3100', {}),
    state = (await store.read())!;
  expect(state).toMatchObject({
    mode: 'local',
    upgrade: true,
    key: Buffer.alloc(32, 9).toString('hex'),
  });
  expect(await readFile(path.join(store.directory, 'environment-before-upgrade.env'), 'utf8')).toBe(
    original,
  );
  expect(await readFile(path.join(old, 'pglite', 'legacy.fixture'), 'utf8')).toBe(
    'preserved database bytes',
  );
  expect(await readFile(path.join(old, 'encryption.key'))).toEqual(Buffer.alloc(32, 9));
  const guest = await store.session();
  expect(guest.value.step).toBe('token');
  await expect(store.verified(guest.token, guest.value.csrf)).rejects.toMatchObject({
    status: 403,
  });
  const owner = await store.exchange(guest.token, guest.value.csrf, token);
  expect((await store.verified(owner.token, owner.csrf)).value.step).toBe('requirements');
  await expect(prepareLocalUpgrade(store, 'http://localhost:3100', {})).rejects.toMatchObject({
    code: 'installation_closed',
  });
});
it('rejects nonlocal origins and completed or configured PostgreSQL workspaces without replacing their configuration', async () => {
  const original = 'TRAINING_INSTALL_STATE=installed\nAPP_ENCRYPTION_KEY=' + 'a'.repeat(64) + '\n';
  await writeFile(path.join(root, '.env'), original);
  await expect(prepareLocalUpgrade(store, 'http://remote.example.test', {})).rejects.toMatchObject({
    status: 422,
  });
  await expect(prepareLocalUpgrade(store, 'http://localhost:3100', {})).rejects.toMatchObject({
    code: 'legacy_local_required',
  });
  expect(await readFile(path.join(root, '.env'), 'utf8')).toBe(original);
  expect(await store.read()).toBeNull();
  const postgres = 'DATABASE_URL=postgresql://localhost/existing\n';
  await writeFile(path.join(root, '.env'), postgres);
  await expect(prepareLocalUpgrade(store, 'http://localhost:3100', {})).rejects.toMatchObject({
    code: 'legacy_local_required',
  });
  expect(await readFile(path.join(root, '.env'), 'utf8')).toBe(postgres);
  const migration = 'MIGRATION_DATABASE_URL=postgresql://localhost/existing\n';
  await writeFile(path.join(root, '.env'), migration);
  await expect(prepareLocalUpgrade(store, 'http://localhost:3100', {})).rejects.toMatchObject({
    code: 'legacy_local_required',
  });
  expect(await readFile(path.join(root, '.env'), 'utf8')).toBe(migration);
});
