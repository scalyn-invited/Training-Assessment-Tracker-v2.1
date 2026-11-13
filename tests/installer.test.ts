import { beforeEach, afterEach, it, expect } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parse } from 'dotenv';
import { testDatabase } from './helpers.js';
import { InstallationState } from '../packages/domain/src/installation-state.js';
import { Installer } from '../packages/domain/src/installer.js';
import {
  InstallationDatabase,
  installationDatabaseUrl,
  installationRole,
} from '../packages/domain/src/installation-database.js';
import { passwordMatches } from '../packages/domain/src/crypto.js';
import { migrate } from '../packages/database/src/migrate.js';
import { Database } from '../packages/database/src/database.js';
let root: string,
  store: InstallationState,
  installer: Installer,
  instance: Awaited<ReturnType<typeof testDatabase>>,
  owner: { token: string; csrf: string };
const input = {
  host: '127.0.0.1',
  port: 55439,
  database: 'postgres',
  username: 'postgres',
  password: 'postgres',
};
const administrator = {
  name: 'Personal administrator',
  email: 'owner@setup.example.test',
  password: 'Private administrator passphrase',
  confirmation: 'Private administrator passphrase',
};
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'tracker-installer-'));
  store = new InstallationState(root);
  await store.initialize('https://setup.example.test', {});
  instance = await testDatabase({ migrate: false });
  installer = new Installer(store, new InstallationDatabase(), {});
  const token = await store.issueToken(),
    guest = await store.session();
  owner = await store.exchange(guest.token, guest.value.csrf, token);
});
afterEach(async () => {
  await instance?.close();
  if (
    root &&
    path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep) &&
    path.basename(root).startsWith('tracker-installer-')
  )
    await rm(root, { recursive: true, force: true });
});
async function prepare() {
  await installer.prepareDatabase(owner.token, owner.csrf, input);
  await installer.prepareAdministrator(owner.token, owner.csrf, administrator);
}
it('rejects injected connection fields and preserves nonempty or foreign-owned databases', async () => {
  for (const values of [
    { host: 'localhost;options=evil' },
    { database: 'name?options=evil' },
    { port: 0 },
    { username: 'bad\nuser' },
    { password: 'bad\npassword' },
  ])
    expect(() => installationDatabaseUrl({ ...input, ...values })).toThrow();
  const encoded = installationDatabaseUrl({
    ...input,
    username: 'user@name',
    password: 'a$#%"\\password',
  });
  expect(decodeURIComponent(new URL(encoded).password)).toBe('a$#%"\\password');
  await instance.db.pool.query('CREATE SCHEMA retained; CREATE TABLE retained.history(value text)');
  await expect(installer.prepareDatabase(owner.token, owner.csrf, input)).rejects.toMatchObject({
    code: 'database_not_empty',
  });
  expect(
    (await instance.db.pool.query('SELECT count(*) FROM retained.history')).rows[0].count,
  ).toBe('0');
  await instance.db.pool.query('DROP TABLE retained.history; DROP SCHEMA retained');
  await instance.db.pool.query('CREATE TABLE unrelated(value text)');
  await expect(installer.prepareDatabase(owner.token, owner.csrf, input)).rejects.toMatchObject({
    status: 409,
    code: 'database_not_empty',
  });
  expect(
    (await instance.db.pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public'"))
      .rows,
  ).toEqual([{ tablename: 'unrelated' }]);
  await instance.db.pool.query('DROP TABLE unrelated');
  const state = (await store.read())!;
  const connection = new InstallationDatabase().connect(input, state);
  try {
    await new InstallationDatabase().claim(connection, {
      ...state,
      id: '10000000-0000-4000-8000-000000000001',
    });
  } finally {
    await connection.close();
  }
  await expect(installer.prepareDatabase(owner.token, owner.csrf, input)).rejects.toMatchObject({
    status: 409,
    code: 'database_owned',
  });
});
it('advances owned stages once, preserves credentials and writes a safe hosted profile', async () => {
  await writeFile(
    path.join(root, '.env'),
    'UNRELATED_SETTING="keep this"\nTRAINING_INSTALL_STATE=pending\nSMTP_ENABLED=true\nexport SMTP_ENABLED = true\nAI_LIVE_ENABLED = true\n',
  );
  await prepare();
  expect(await installer.advance(owner.token, owner.csrf)).toEqual({
    stage: 'migrated',
    complete: false,
  });
  const state = (await store.read())!,
    role = installationRole(state);
  expect(
    (await instance.db.pool.query('SELECT DISTINCT tenant_role FROM schema_migrations')).rows,
  ).toEqual([{ tenant_role: role }]);
  const connection = new Database(installationDatabaseUrl(input), role);
  try {
    await migrate(connection);
  } finally {
    await connection.close();
  }
  await expect(migrate(instance.db)).rejects.toThrow('configured tenant role differs');
  expect(await installer.advance(owner.token, owner.csrf)).toEqual({
    stage: 'seeded',
    complete: false,
  });
  expect(await installer.advance(owner.token, owner.csrf)).toEqual({
    stage: 'administrator',
    complete: false,
  });
  const users = (await instance.db.pool.query('SELECT * FROM users')).rows;
  expect(users).toHaveLength(1);
  expect(users[0]).toMatchObject({
    environment: 'production',
    is_synthetic: false,
    name: administrator.name,
    email: administrator.email,
  });
  expect(await passwordMatches(administrator.password, users[0].password_hash)).toBe(true);
  expect((await instance.db.pool.query('SELECT id FROM organisations')).rowCount).toBe(0);
  expect(await installer.advance(owner.token, owner.csrf)).toEqual({
    stage: 'complete',
    complete: true,
  });
  expect((await store.read())?.ownerHash).toBeUndefined();
  await expect(readFile(store.sessionPath(owner.token))).rejects.toMatchObject({ code: 'ENOENT' });
  const environment = parse(await readFile(path.join(root, '.env')));
  expect(environment).toMatchObject({
    UNRELATED_SETTING: 'keep this',
    NODE_ENV: 'production',
    APP_ORIGIN: 'https://setup.example.test',
    TRAINING_ENVIRONMENT: 'production',
    TRAINING_AUTH_MODE: 'local_password',
    MOCK_IDENTITY_ENABLED: 'false',
    AI_LIVE_ENABLED: 'false',
    SMTP_ENABLED: 'false',
    ACCOUNT_MAIL_ENABLED: 'false',
    DATABASE_TENANT_ROLE: role,
  });
  expect(await readFile(path.join(store.directory, 'environment-before-install.env'), 'utf8')).toBe(
    'UNRELATED_SETTING="keep this"\nTRAINING_INSTALL_STATE=pending\nSMTP_ENABLED=true\nexport SMTP_ENABLED = true\nAI_LIVE_ENABLED = true\n',
  );
  await expect(installer.advance(owner.token, owner.csrf)).rejects.toMatchObject({ status: 404 });
  expect(
    (await instance.db.pool.query('SELECT password_hash FROM users')).rows[0].password_hash,
  ).toBe(users[0].password_hash);
});
it('rejects changed administrator fingerprints and unsafe external overrides without resetting stages', async () => {
  await prepare();
  await installer.advance(owner.token, owner.csrf);
  await installer.prepareAdministrator(owner.token, owner.csrf, {
    ...administrator,
    password: 'A changed administrator passphrase',
    confirmation: 'A changed administrator passphrase',
  });
  await expect(installer.advance(owner.token, owner.csrf)).rejects.toMatchObject({
    status: 409,
    code: 'administrator_changed',
  });
  expect(
    (await instance.db.pool.query('SELECT stage FROM training_installations')).rows[0].stage,
  ).toBe('migrated');
  await installer.prepareAdministrator(owner.token, owner.csrf, administrator);
  const unsafe = new Installer(store, new InstallationDatabase(), { AI_LIVE_ENABLED: 'true' });
  await expect(unsafe.advance(owner.token, owner.csrf)).rejects.toMatchObject({
    status: 409,
    code: 'environment_conflict',
  });
  expect((await instance.db.pool.query('SELECT id FROM users')).rowCount).toBe(0);
  expect(await installer.advance(owner.token, owner.csrf)).toMatchObject({ stage: 'seeded' });
});
it('resumes configuration failure after database completion without replacing the administrator', async () => {
  await prepare();
  await installer.advance(owner.token, owner.csrf);
  await installer.advance(owner.token, owner.csrf);
  await installer.advance(owner.token, owner.csrf);
  const before = (await instance.db.pool.query('SELECT id,password_hash FROM users')).rows;
  const write = installer.writeEnvironment.bind(installer);
  installer.writeEnvironment = async () => {
    throw new Error('Simulated private configuration interruption');
  };
  await expect(installer.advance(owner.token, owner.csrf)).rejects.toMatchObject({
    status: 503,
    code: 'installation_stage_failed',
  });
  expect(
    (await instance.db.pool.query('SELECT stage FROM training_installations')).rows[0].stage,
  ).toBe('complete');
  expect((await store.read())?.status).toBe('installing');
  installer.writeEnvironment = write;
  expect(await installer.advance(owner.token, owner.csrf)).toMatchObject({ stage: 'complete' });
  expect((await instance.db.pool.query('SELECT id,password_hash FROM users')).rows).toEqual(before);
});
