import 'dotenv/config';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { mkdir, open, unlink } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { Database } from '../packages/database/src/database.js';
import { migrate } from '../packages/database/src/migrate.js';
import { port, privatePath } from '../packages/database/src/config.js';
if (process.env.NODE_ENV === 'production')
  throw new Error('Use separate production process commands.');
if (!process.env.DATABASE_URL && process.env.MIGRATION_DATABASE_URL)
  throw new Error(
    'Set DATABASE_URL alongside MIGRATION_DATABASE_URL; local and configured databases cannot be mixed.',
  );
const children: ChildProcess[] = [];
let pglite: PGlite | undefined, server: PGLiteSocketServer | undefined;
let lock: Awaited<ReturnType<typeof open>> | undefined,
  lockPath: string | undefined,
  closing = false;
async function stop(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill('SIGTERM');
  await Promise.all(
    children.map(
      (child) =>
        new Promise<void>((resolve) => {
          if (child.exitCode !== null || child.signalCode !== null) return resolve();
          child.once('exit', () => resolve());
          setTimeout(() => {
            child.kill('SIGKILL');
            resolve();
          }, 5000).unref();
        }),
    ),
  );
  await server?.stop();
  await pglite?.close();
  await lock?.close();
  if (lockPath && lock) await unlink(lockPath).catch(() => {});
  process.exitCode = code;
}
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
function run(args: string[], cwd = process.cwd()) {
  const child = spawn(process.execPath, args, {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
      APP_ORIGIN: process.env.APP_ORIGIN ?? 'http://localhost:' + port('WEB_PORT', 3100),
      API_INTERNAL_ORIGIN: 'http://127.0.0.1:' + port('API_PORT', 3101),
    },
  });
  children.push(child);
  child.once('error', () => void stop(1));
  child.once('exit', (code) => {
    if (!closing) void stop(code ?? 1);
  });
}
try {
  if (!process.env.DATABASE_URL) {
    const directory = path.join(privatePath(), 'pglite');
    await mkdir(directory, { recursive: true });
    lockPath = directory + '.lock';
    lock = await open(lockPath, 'wx');
    await lock.writeFile(String(process.pid));
    console.log('Starting local database…');
    pglite = await PGlite.create(
      process.env.TRACKER_EPHEMERAL_TEST_DB === '1' ? 'memory://' : directory,
    );
    server = new PGLiteSocketServer({
      db: pglite,
      host: '127.0.0.1',
      maxConnections: 16,
      port: port('PGLITE_PORT', 55431),
    });
    await server.start();
  }
  const db = new Database(process.env.MIGRATION_DATABASE_URL);
  try {
    console.log('Verifying SQL migrations…');
    await migrate(db);
  } finally {
    await db.close();
  }
  run(['--import', 'tsx', 'apps/api/src/main.ts']);
  run(['--import', 'tsx', 'apps/worker/src/main.ts']);
  run(
    [
      path.resolve('node_modules/next/dist/bin/next'),
      'dev',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(port('WEB_PORT', 3100)),
    ],
    path.resolve('apps/web'),
  );
  console.log('V2.1: http://localhost:' + port('WEB_PORT', 3100));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Startup failed');
  await stop(1);
}
