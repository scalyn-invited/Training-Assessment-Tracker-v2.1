import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
const root = path.resolve(
  '.runtime/expanded-real-api',
  new Date().toISOString().replace(/[:.]/g, '-'),
);
await mkdir(root, { recursive: true });
Object.assign(process.env, {
  DOTENV_CONFIG_PATH: path.join(root, 'unused.env'),
  TRACKER_EPHEMERAL_TEST_DB: '1',
  PRIVATE_STORAGE_PATH: path.join(root, 'private'),
  NODE_ENV: 'test',
  TRAINING_ENVIRONMENT: 'test',
  TRAINING_AUTH_MODE: 'local_password',
  MOCK_IDENTITY_ENABLED: 'false',
  SMTP_ENABLED: 'false',
  ACCOUNT_MAIL_ENABLED: 'false',
  AI_LIVE_ENABLED: 'false',
  WEB_PORT: '3110',
  API_PORT: '3111',
  PGLITE_PORT: '55432',
  APP_ORIGIN: 'http://127.0.0.1:3110',
  API_INTERNAL_ORIGIN: 'http://127.0.0.1:3111',
  NEXT_DIST_DIR: '.next-expanded',
});
for (const k of [
  'DATABASE_URL',
  'MIGRATION_DATABASE_URL',
  'APP_ENCRYPTION_KEY',
  'CLAMSCAN_PATH',
  'CLAMSCAN_DATABASE',
])
  delete process.env[k];
const { PGlite } = await import('@electric-sql/pglite');
const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');
const db = await PGlite.create('memory://');
const socket = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 55432, maxConnections: 16 });
await socket.start();
const { Database } = await import('../../packages/database/src/database.js');
const { migrate } = await import('../../packages/database/src/migrate.js');
const database = new Database();
await migrate(database);
await database.close();
const children: ChildProcess[] = [];
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  for (const c of children) c.kill();
  await socket.stop();
  await db.close();
}
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
function run(args: string[], cwd = process.cwd(), env = process.env) {
  const c = spawn(process.execPath, args, { cwd, env, stdio: 'inherit' });
  children.push(c);
  c.on('exit', () => void stop());
  return c;
}
run(['--import', 'tsx', 'apps/api/src/main.ts']);
run(['--import', 'tsx', 'apps/worker/src/main.ts']);
run(
  [
    path.resolve('node_modules/next/dist/bin/next'),
    'start',
    '--hostname',
    '127.0.0.1',
    '--port',
    '3110',
  ],
  path.resolve('apps/web'),
  { ...process.env, NODE_ENV: 'production' },
);
