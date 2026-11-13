import path from 'node:path';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import EmbeddedPostgres from 'embedded-postgres';
import { Database } from '../packages/database/src/database.js';
import { migrate } from '../packages/database/src/migrate.js';
const root = path.resolve(process.env.TRACKER_OPERATOR_BROWSER_ROOT ?? '');
if (!root.startsWith(path.resolve('.runtime/operator-browser') + path.sep))
  throw new Error('An isolated operator browser directory is required.');
await mkdir(path.join(root, 'private'), { recursive: true });
const password = randomBytes(24).toString('hex'),
  key = randomBytes(32).toString('hex'),
  role = 'tracker_tenant_' + randomBytes(6).toString('hex');
const postgres = new EmbeddedPostgres({
  databaseDir: path.join(root, 'postgres'),
  user: 'postgres',
  password,
  port: 25446,
  persistent: true,
  createPostgresUser: false,
  autoRehydrateSymlinks: true,
  postgresFlags: ['-h', '127.0.0.1'],
  onLog: () => {},
  onError: () => {},
});
const connection = 'postgresql://postgres:' + password + '@127.0.0.1:25446/operator_browser_test';
const environment = {
  ...process.env,
  NODE_ENV: 'production',
  TRAINING_ENVIRONMENT: 'production',
  TRAINING_AUTH_MODE: 'local_password',
  TRAINING_INSTALL_MODE: 'hosted',
  TRAINING_LOCAL_PRODUCTION: 'true',
  TRAINING_LOCAL_PRODUCTION_DATABASE: 'operator_browser_test',
  DATABASE_URL: connection,
  MIGRATION_DATABASE_URL: '',
  DATABASE_TENANT_ROLE: role,
  APP_ENCRYPTION_KEY: key,
  PRIVATE_STORAGE_PATH: path.join(root, 'private'),
  DOTENV_CONFIG_PATH: path.join(root, '.env'),
  APP_ORIGIN: 'http://127.0.0.1:3160',
  API_PORT: '3161',
  API_INTERNAL_ORIGIN: 'http://127.0.0.1:3161',
  MOCK_IDENTITY_ENABLED: 'false',
  AI_LIVE_ENABLED: 'false',
  AI_ANTHROPIC_ENABLED: 'false',
  AI_GEMINI_ENABLED: 'false',
  SMTP_ENABLED: 'false',
  ACCOUNT_MAIL_ENABLED: 'false',
  RETENTION_APPROVED: 'false',
};
await writeFile(path.join(root, '.env'), '# Isolated operator bootstrap qualification\n', {
  flag: 'wx',
});
let child: ChildProcess | undefined,
  started = false,
  closing = false,
  restarting = false;
let restartTimer: ReturnType<typeof setInterval> | undefined;
async function stop(code = 0) {
  if (closing) return;
  closing = true;
  clearInterval(restartTimer);
  if (child && child.exitCode === null && child.signalCode === null)
    await new Promise<void>((resolve) => {
      child!.once('exit', () => resolve());
      if (child!.connected) child!.send('shutdown');
      else child!.kill('SIGTERM');
      setTimeout(() => {
        child!.kill('SIGKILL');
        resolve();
      }, 10000).unref();
    });
  if (started)
    await promisify(execFile)(
      path.resolve('node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe'),
      ['-D', path.join(root, 'postgres'), '-m', 'fast', '-w', '-t', '60', 'stop'],
      { windowsHide: true, timeout: 70000 },
    );
  process.exitCode = code;
}
async function run(args: string[], env = environment, privateOutput = false) {
  return new Promise<string>((resolve, reject) => {
    const processChild = spawn(process.execPath, args, {
      env,
      windowsHide: true,
      stdio: privateOutput ? 'pipe' : 'inherit',
    });
    let stdout = '';
    processChild.stdout?.on('data', (data) => {
      stdout += data;
    });
    processChild.stderr?.on('data', () => {});
    processChild.once('error', () =>
      reject(new Error('Operator qualification command failed to start.')),
    );
    processChild.once('exit', (code) =>
      code === 0
        ? resolve(stdout)
        : reject(new Error('Operator qualification command failed; private output withheld.')),
    );
  });
}
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
try {
  await postgres.initialise();
  await postgres.start();
  started = true;
  await postgres.createDatabase('operator_browser_test');
  const db = new Database(connection, role);
  try {
    await migrate(db);
  } finally {
    await db.close();
  }
  const args = [
    '--name',
    'Bootstrap Owner',
    '--email',
    'owner@bootstrap.example.invalid',
    '--operator',
    'browser-rehearsal',
    '--reason',
    'Isolated browser bootstrap qualification',
    '--json',
  ];
  const first = await run(
    ['--import', 'tsx', 'scripts/operator-bootstrap.ts', 'initialize-production', ...args],
    { ...environment, TRAINING_LOCAL_PRODUCTION: 'false', APP_ORIGIN: 'https://127.0.0.1:3160' },
    true,
  );
  const second = await run(
    ['--import', 'tsx', 'scripts/operator-bootstrap.ts', 'initialize-local-production', ...args],
    environment,
    true,
  );
  let oldLink: string, link: string;
  try {
    oldLink = JSON.parse(first).url;
    link = JSON.parse(second).url;
    if (typeof oldLink !== 'string' || typeof link !== 'string') throw new Error();
  } catch {
    throw new Error('Private bootstrap output was not valid JSON.');
  }
  await writeFile(
    path.join(root, 'fixture.json'),
    JSON.stringify({ oldLink: oldLink.replace('https:', 'http:'), link, connection, key, role }),
    { mode: 0o600 },
  );
  await run([path.resolve('node_modules/typescript/bin/tsc'), '-p', 'tsconfig.server.json']);
  await run([path.resolve('node_modules/next/dist/bin/next'), 'build', 'apps/web']);
  function launch() {
    child = spawn(process.execPath, ['--import', 'tsx', 'scripts/local-production.ts'], {
      env: environment,
      windowsHide: true,
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    });
    child.once('error', () => void stop(1));
    child.once('exit', (code) => {
      if (!closing && !restarting) void stop(code ?? 1);
    });
  }
  launch();
  restartTimer = setInterval(() => {
    if (closing || restarting) return;
    void (async () => {
      try {
        await readFile(path.join(root, 'restart-request'));
      } catch {
        return;
      }
      if (closing || restarting) return;
      restarting = true;
      await unlink(path.join(root, 'restart-request'));
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Runtime did not stop.')), 15000);
        child!.once('exit', (code) => {
          clearTimeout(timer);
          if (code === 0) resolve();
          else reject(new Error('Runtime shutdown failed.'));
        });
        child!.send('shutdown');
      });
      launch();
      restarting = false;
      await writeFile(path.join(root, 'restart-complete'), '1');
    })().catch(() => void stop(1));
  }, 250);
} catch {
  await stop(1);
  throw new Error('Isolated operator browser setup failed; private output withheld.');
}
