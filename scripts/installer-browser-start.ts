import { createServer } from 'node:https';
import { request as proxyRequest } from 'node:http';
import EmbeddedPostgres from 'embedded-postgres';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { parse } from 'dotenv';
import { InstallationState } from '../packages/domain/src/installation-state.js';
import { port } from '../packages/database/src/config.js';
import { Database } from '../packages/database/src/database.js';
const root = path.resolve(process.env.TRACKER_INSTALLER_BROWSER_ROOT ?? '');
if (!root.startsWith(path.resolve('.runtime/installer-browser') + path.sep))
  throw new Error('Installer browser checks require an isolated runtime directory.');
await mkdir(root, { recursive: true, mode: 0o700 });
const application = path.join(root, 'application');
await mkdir(application, { recursive: true, mode: 0o700 });
const key = path.join(root, 'localhost.key'),
  cert = path.join(root, 'localhost.crt');
await promisify(execFile)(
  process.env.OPENSSL_PATH ??
    (process.platform === 'win32' ? 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe' : 'openssl'),
  [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    key,
    '-out',
    cert,
    '-days',
    '1',
    '-subj',
    '/CN=localhost',
    '-addext',
    'subjectAltName=DNS:localhost,IP:127.0.0.1',
  ],
  { windowsHide: true, timeout: 30000 },
);
const password = randomBytes(24).toString('hex'),
  folder = path.join(root, 'postgres');
const postgresPort = port('TRACKER_INSTALLER_POSTGRES_PORT', 25441);
const postgres = new EmbeddedPostgres({
  databaseDir: folder,
  user: 'postgres',
  password,
  port: postgresPort,
  persistent: true,
  createPostgresUser: false,
  autoRehydrateSymlinks: true,
  postgresFlags: ['-h', '127.0.0.1'],
  onLog: () => {},
  onError: () => {},
});
const proxy = createServer({ key: await readFile(key), cert: await readFile(cert) }, (req, res) => {
  if (!req.url?.startsWith('/')) {
    res.writeHead(400);
    res.end();
    return;
  }
  const upstream = proxyRequest(
    {
      hostname: '127.0.0.1',
      port: 3122,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: 'localhost:3120',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'localhost:3120',
      },
    },
    (response) => {
      res.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(res);
    },
  );
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502);
    res.end('Test web process is starting.');
  });
  req.pipe(upstream);
});
// Forward Next development WebSocket upgrades so hydration can finish behind TLS.
const upgraded = new Set<import('node:net').Socket>();
proxy.on('upgrade', (req, socket, head) => {
  const upstream = proxyRequest({
    hostname: '127.0.0.1',
    port: 3122,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: 'localhost:3120', 'x-forwarded-proto': 'https' },
  });
  upstream.on('upgrade', (response, target, upstreamHead) => {
    upgraded.add(target);
    target.once('close', () => upgraded.delete(target));
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        Object.entries(response.headers)
          .map(([name, value]) => name + ': ' + value)
          .join('\r\n') +
        '\r\n\r\n',
    );
    if (head.length) target.write(head);
    if (upstreamHead.length) socket.write(upstreamHead);
    socket.on('error', () => target.destroy());
    target.on('error', () => socket.destroy());
    socket.pipe(target).pipe(socket);
  });
  upstream.on('error', () => socket.destroy());
  upstream.end();
});
await new Promise<void>((resolve, reject) => {
  proxy.once('error', reject);
  proxy.listen(3120, '127.0.0.1', resolve);
});
const children: ChildProcess[] = [];
let closing = false,
  started = false,
  transitioning = false,
  setup: ChildProcess | undefined,
  timer: ReturnType<typeof setInterval> | undefined;
async function terminate(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  await new Promise<void>((resolve) => {
    child.once('exit', () => resolve());
    setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 5000).unref();
  });
}
async function stop(code = 0) {
  if (closing) return;
  closing = true;
  if (timer) clearInterval(timer);
  for (const socket of upgraded) socket.destroy();
  proxy.closeAllConnections();
  await new Promise<void>((resolve) => proxy.close(() => resolve()));
  await Promise.all(children.map(terminate));
  if (started) {
    if (process.platform === 'win32')
      await promisify(execFile)(
        path.resolve('node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe'),
        ['-D', folder, '-m', 'fast', '-w', '-t', '20', 'stop'],
        { windowsHide: true, timeout: 30000 },
      );
    else await postgres.stop();
  }
  process.exitCode = code;
}
process.once('SIGTERM', () => void stop());
process.once('SIGINT', () => void stop());
const clean = { ...process.env };
for (const name of [
  'DATABASE_URL',
  'MIGRATION_DATABASE_URL',
  'DATABASE_TENANT_ROLE',
  'APP_ENCRYPTION_KEY',
  'PRIVATE_STORAGE_PATH',
  'TRAINING_ENVIRONMENT',
  'TRAINING_AUTH_MODE',
  'MOCK_IDENTITY_ENABLED',
  'AI_LIVE_ENABLED',
  'AI_ANTHROPIC_ENABLED',
  'AI_GEMINI_ENABLED',
  'SMTP_ENABLED',
  'ACCOUNT_MAIL_ENABLED',
  'RETENTION_APPROVED',
])
  delete clean[name];
function run(args: string[], env: NodeJS.ProcessEnv, cwd = process.cwd()) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: 'inherit', windowsHide: true });
  children.push(child);
  child.once('error', () => void stop(1));
  child.once('exit', (code) => {
    if (!closing && !(transitioning && child === setup)) void stop(code ?? 1);
  });
  return child;
}
try {
  await postgres.initialise();
  await postgres.start();
  started = true;
  await postgres.createDatabase('training_installer_test');
  const url =
    'postgresql://postgres:' + password + '@127.0.0.1:' + postgresPort + '/training_installer_test';
  const db = new Database(url);
  try {
    await db.pool.query('CREATE ROLE tracker_tenant NOLOGIN NOSUPERUSER NOBYPASSRLS');
  } finally {
    await db.close();
  }
  const store = new InstallationState(application);
  await store.initialize('https://localhost:3120', {});
  const token = await store.issueToken();
  await writeFile(
    path.join(root, 'fixture.json'),
    JSON.stringify({ token, password, application, url, postgresPort }),
    { mode: 0o600 },
  );
  const backend = {
    ...clean,
    NODE_ENV: 'production',
    DOTENV_CONFIG_PATH: path.join(application, '.env'),
    SETUP_APP_ROOT: application,
    SETUP_TRUSTED_PROXY: '127.0.0.1',
    API_PORT: '3121',
    APP_ORIGIN: 'https://localhost:3120',
  };
  setup = run(['--import', 'tsx', 'apps/api/src/setup.ts'], backend);
  run(
    [
      path.resolve('node_modules/next/dist/bin/next'),
      'dev',
      '--hostname',
      '127.0.0.1',
      '--port',
      '3122',
    ],
    {
      ...clean,
      NODE_ENV: 'development',
      NEXT_TELEMETRY_DISABLED: '1',
      API_INTERNAL_ORIGIN: 'http://127.0.0.1:3121',
    },
    path.resolve('apps/web'),
  );
  timer = setInterval(
    () =>
      void (async () => {
        if (transitioning || closing) return;
        if (
          !(await access(path.join(root, 'start-runtime')).then(
            () => true,
            () => false,
          ))
        )
          return;
        if ((await store.read())?.status !== 'installed')
          throw new Error('Runtime transition requires completed installation.');
        transitioning = true;
        await terminate(setup!);
        const configured = parse(await readFile(path.join(application, '.env')));
        run(['--import', 'tsx', 'apps/api/src/main.ts'], {
          ...clean,
          ...configured,
          API_PORT: '3121',
          DOTENV_CONFIG_PATH: path.join(application, '.env'),
        });
        run(['--import', 'tsx', 'apps/worker/src/main.ts'], {
          ...clean,
          ...configured,
          DOTENV_CONFIG_PATH: path.join(application, '.env'),
        });
        clearInterval(timer);
        await writeFile(path.join(root, 'runtime-started'), 'started');
      })().catch(() => void stop(1)),
    250,
  );
  console.log('Isolated HTTPS installer and PostgreSQL fixture ready; credentials are not logged.');
} catch (error) {
  await stop(1);
  throw error;
}
