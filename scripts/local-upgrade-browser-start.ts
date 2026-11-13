import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import EmbeddedPostgres from 'embedded-postgres';
import { InstallationState } from '../packages/domain/src/installation-state.js';
import { prepareLocalUpgrade } from '../packages/domain/src/local-upgrade.js';
const root = path.resolve(process.env.TRACKER_UPGRADE_BROWSER_ROOT ?? '');
if (!root.startsWith(path.resolve('.runtime/upgrade-browser') + path.sep))
  throw new Error('An isolated upgrade test directory is required.');
const application = path.join(root, 'application');
const oldPrivate = path.join(application, '.runtime/private');
await mkdir(path.join(oldPrivate, 'pglite'), { recursive: true });
const original = 'NODE_ENV=production\nAPP_ORIGIN=http://127.0.0.1:3140\nUNCHANGED=preserved\n';
await writeFile(path.join(application, '.env'), original);
await writeFile(path.join(oldPrivate, 'encryption.key'), Buffer.alloc(32, 7));
await writeFile(path.join(oldPrivate, 'pglite/legacy.fixture'), 'preserved old database bytes');
const token = await prepareLocalUpgrade(
  new InstallationState(application),
  'http://127.0.0.1:3140',
  {},
);
const password = randomBytes(24).toString('hex');
const databasePort = Number(process.env.TRACKER_UPGRADE_DB_PORT ?? 55443);
if (!Number.isInteger(databasePort) || databasePort < 1024 || databasePort > 65535) throw new Error('Choose a valid isolated upgrade database port.');
let fixtureStage = 'initialize', startupCategory = 'unknown';
const postgres = new EmbeddedPostgres({
  databaseDir: path.join(root, 'postgres'),
  user: 'postgres',
  password,
  port: databasePort,
  persistent: true,
  createPostgresUser: false,
  autoRehydrateSymlinks: true,
  postgresFlags: ['-h', '127.0.0.1'],
  onLog: (message: string) => {
    if (/could not bind|address already in use|permission denied.*socket/i.test(message)) startupCategory = 'socket_bind';
    else if (/could not create shared memory|could not map|out of memory/i.test(message)) startupCategory = 'memory';
    else if (/permission denied|access is denied/i.test(message)) startupCategory = 'filesystem_permission';
    else if (/database system is ready/i.test(message)) startupCategory = 'ready';
  },
  onError: () => {},
});
let child: ChildProcess | undefined,
  started = false,
  closing = false;
async function stop(code = 0) {
  if (closing) return;
  closing = true;
  if (child && child.exitCode === null && child.signalCode === null)
    await new Promise<void>((resolve) => {
      child!.once('exit', () => resolve());
      child!.kill('SIGTERM');
      setTimeout(() => {
        child!.kill('SIGKILL');
        resolve();
      }, 10000).unref();
    });
  if (started) {
    if (process.platform === 'win32') await promisify(execFile)(
      path.resolve('node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe'),
      ['-D', path.join(root, 'postgres'), '-m', 'fast', '-w', '-t', '60', 'stop'],
      { windowsHide: true, timeout: 70000 },
    );
    else await postgres.stop();
  }
  process.exitCode = code;
}
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
try {
  await postgres.initialise();
  fixtureStage = 'start';
  await postgres.start();
  started = true;
  fixtureStage = 'create_database';
  await postgres.createDatabase('local_upgrade_test');
  fixtureStage = 'write_fixture';
  await writeFile(
    path.join(root, 'fixture.json'),
    JSON.stringify({ token, password, original, application, databasePort }),
    { mode: 0o600 },
  );
  const environment = {
    ...process.env,
    SETUP_APP_ROOT: application,
    DOTENV_CONFIG_PATH: path.join(application, '.env'),
    WEB_PORT: '3140',
    API_PORT: '3141',
    APP_ORIGIN: 'http://127.0.0.1:3140',
  };
  for (const key of [
    'NODE_ENV',
    'DATABASE_URL',
    'MIGRATION_DATABASE_URL',
    'APP_ENCRYPTION_KEY',
    'PRIVATE_STORAGE_PATH',
    'DATABASE_TENANT_ROLE',
  ])
    delete environment[key as keyof typeof environment];
  child = spawn(process.execPath, ['--import', 'tsx', 'scripts/dev.ts'], {
    env: environment,
    stdio: 'inherit',
    windowsHide: true,
  });
  child.once('error', () => void stop(1));
  child.once('exit', (code) => {
    if (!closing) void stop(code ?? 1);
  });
} catch (error) {
  const code = error && typeof error === 'object' && 'code' in error && /^[A-Z0-9_]+$/.test(String(error.code)) ? String(error.code) : 'unavailable';
  console.error(`Upgrade fixture startup failed: stage=${fixtureStage}, category=${startupCategory}, code=${code}`);
  await stop(1);
  throw new Error('The isolated upgrade fixture could not start.');
}
