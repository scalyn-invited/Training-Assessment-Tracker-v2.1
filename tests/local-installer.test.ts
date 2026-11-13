import { beforeAll, afterAll, it, expect } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse } from 'dotenv';
import { testDatabase } from './helpers.js';
import { InstallationState } from '../packages/domain/src/installation-state.js';
import { Installer } from '../packages/domain/src/installer.js';
import { passwordMatches } from '../packages/domain/src/crypto.js';
let instance: Awaited<ReturnType<typeof testDatabase>>,
  root: string,
  store: InstallationState,
  installer: Installer,
  session: { token: string; csrf: string };
const local = {
  host: '127.0.0.1',
  port: 55439,
  database: 'postgres',
  username: 'postgres',
  password: 'postgres',
};
const administrator = {
  name: 'Personal local owner',
  email: 'owner@local.example.test',
  password: 'Private personal administrator passphrase',
  confirmation: 'Private personal administrator passphrase',
  demoPassword: 'Separate fictional fixture passphrase',
  demoConfirmation: 'Separate fictional fixture passphrase',
};
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'tracker-local-installer-'));
  store = new InstallationState(root);
  await store.initialize('http://localhost:3100', {}, 'local');
  instance = await testDatabase({ migrate: false });
  installer = new Installer(store, undefined, {}, undefined, local);
  const guest = await store.session();
  session = { token: guest.token, csrf: guest.value.csrf };
});
afterAll(async () => {
  await instance?.close();
  if (
    root &&
    path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep) &&
    path.basename(root).startsWith('tracker-local-installer-')
  )
    await rm(root, { recursive: true, force: true });
});
it('owns a private local CSRF session and rejects unavailable or caller-controlled local database settings', async () => {
  expect((await store.verified(session.token, session.csrf)).value.step).toBe('requirements');
  await expect(store.verified(session.token, 'wrong')).rejects.toMatchObject({ status: 403 });
  await expect(
    new Installer(store, undefined, {}).prepareDatabase(session.token, session.csrf, {
      engine: 'pglite',
    }),
  ).rejects.toMatchObject({ code: 'local_database_unavailable' });
  await expect(
    installer.prepareDatabase(session.token, session.csrf, {
      engine: 'pglite',
      host: 'remote.example.test',
    }),
  ).rejects.toThrow();
  expect(
    await installer.prepareDatabase(session.token, session.csrf, { engine: 'pglite' }),
  ).toMatchObject({ engine: 'pglite' });
  await expect(
    installer.prepareAdministrator(session.token, session.csrf, {
      ...administrator,
      demoPassword: administrator.password,
      demoConfirmation: administrator.password,
    }),
  ).rejects.toMatchObject({ code: 'separate_passwords' });
  await expect(
    installer.prepareAdministrator(session.token, session.csrf, {
      ...administrator,
      email: 'owner@example.invalid',
    }),
  ).rejects.toMatchObject({ code: 'personal_email_required' });
});
it('finishes 25 reviewed fixture stages and preserves a separate personal administrator in persistent local configuration', async () => {
  await installer.prepareAdministrator(session.token, session.csrf, administrator);
  expect(await installer.advance(session.token, session.csrf)).toMatchObject({
    stage: 'migrated',
    fixtureProgress: 0,
  });
  for (let next = 1; next <= 25; next++)
    expect(await installer.advance(session.token, session.csrf)).toMatchObject({
      stage: next === 25 ? 'seeded' : 'migrated',
      fixtureProgress: next,
    });
  expect(await installer.advance(session.token, session.csrf)).toMatchObject({
    stage: 'administrator',
  });
  expect(await installer.advance(session.token, session.csrf)).toMatchObject({ complete: true });
  const users = (await instance.db.pool.query('SELECT * FROM users')).rows;
  expect(users).toHaveLength(31);
  const personal = users.find((u) => !u.is_synthetic)!;
  expect(personal).toMatchObject({
    email: administrator.email,
    environment: 'test',
    global_admin: true,
  });
  expect(await passwordMatches(administrator.password, personal.password_hash)).toBe(true);
  expect(
    await passwordMatches(
      administrator.demoPassword,
      users.find((u) => u.is_synthetic)!.password_hash,
    ),
  ).toBe(true);
  const configured = parse(await readFile(path.join(root, '.env')));
  expect(configured).toMatchObject({
    NODE_ENV: 'development',
    TRAINING_INSTALL_STATE: 'installed',
    TRAINING_INSTALL_MODE: 'local',
    TRAINING_ENVIRONMENT: 'test',
    DATABASE_URL: '',
    PGLITE_PORT: '55439',
    AI_LIVE_ENABLED: 'false',
    SMTP_ENABLED: 'false',
  });
  expect(configured.PRIVATE_STORAGE_PATH).toContain((await store.read())!.id);
  expect((await instance.db.pool.query('SELECT id FROM enrolments')).rowCount).toBe(21);
  await expect(store.session()).rejects.toMatchObject({ status: 404 });
}, 600000);
