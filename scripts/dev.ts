import { config as loadEnvironment, parse } from 'dotenv';
const externalEnvironment = { ...process.env };
loadEnvironment();
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { mkdir, open, unlink, readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { InstallationState } from '../packages/domain/src/installation-state.js';
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
const intentionalStops = new WeakSet<ChildProcess>();
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
function run(args: string[], cwd = process.cwd(), environment = process.env) {
  const child = spawn(process.execPath, args, {
    cwd,
    stdio: 'inherit',
    env: {
      ...environment,
      NEXT_TELEMETRY_DISABLED: '1',
      APP_ORIGIN: environment.APP_ORIGIN ?? 'http://localhost:' + port('WEB_PORT', 3100),
      API_INTERNAL_ORIGIN: 'http://127.0.0.1:' + port('API_PORT', 3101),
    },
  });
  children.push(child);
  child.once('error', () => void stop(1));
  child.once('exit', (code) => {
    if (!closing && !intentionalStops.has(child)) void stop(code ?? 1);
  });
  return child;
}
async function halt(child: ChildProcess) {
  intentionalStops.add(child);
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    child.once('exit', resolve);
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 5000).unref();
  });
}
try {
  const root = path.resolve(process.env.SETUP_APP_ROOT ?? process.cwd());
  const store = new InstallationState(root);
  let installation = process.env.TRACKER_EPHEMERAL_TEST_DB === '1' ? null : await store.read();
  const environmentFile = path.join(root, '.env');
  const oldEnvironment = await readFile(environmentFile, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
  const privateEntries = await readdir(
    process.env.PRIVATE_STORAGE_PATH ?? path.join(root, '.runtime/private'),
  ).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const legacy =
    !installation &&
    (privateEntries.length > 0 ||
      !!process.env.APP_ENCRYPTION_KEY ||
      (!!oldEnvironment && parse(oldEnvironment).TRAINING_INSTALL_STATE !== 'pending') ||
      (!!process.env.DATABASE_URL && parse(oldEnvironment).TRAINING_INSTALL_STATE !== 'pending'));
  if (installation) process.env.APP_ORIGIN = installation.origin;
  if (!installation && !legacy && process.env.TRACKER_EPHEMERAL_TEST_DB !== '1')
    installation = await store.initialize(
      process.env.APP_ORIGIN ?? 'http://localhost:' + port('WEB_PORT', 3100),
      externalEnvironment,
      'local',
    );
  if (installation?.mode === 'hosted')
    throw new Error('Use the hosted setup and runtime commands for this installation.');
  const pending = !!installation && installation.status !== 'installed';
  if (installation?.status === 'installed') {
    const configured = parse(await readFile(environmentFile, 'utf8'));
    Object.assign(process.env, configured, externalEnvironment);
  }
  const localSetupDatabase = pending && !installation?.upgrade;
  if (localSetupDatabase || (!pending && !process.env.DATABASE_URL)) {
    const directory = localSetupDatabase
      ? path.join(root, '.runtime/installations', installation!.id, 'private/pglite')
      : path.join(privatePath(), 'pglite');
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
  async function runtime() {
    const db = new Database(process.env.MIGRATION_DATABASE_URL || undefined);
    try {
      console.log('Verifying SQL migrations...');
      await migrate(db);
    } finally {
      await db.close();
    }
    run(['--import', 'tsx', 'apps/api/src/main.ts']);
    run(['--import', 'tsx', 'apps/worker/src/main.ts']);
  }
  let setup: ChildProcess | undefined;
  if (pending) {
    setup = run(['--import', 'tsx', 'apps/api/src/setup.ts'], process.cwd(), {
      ...externalEnvironment,
      NODE_ENV: 'development',
      DOTENV_CONFIG_PATH: environmentFile,
      SETUP_APP_ROOT: root,
      SETUP_LOCAL_DATABASE: localSetupDatabase ? 'true' : 'false',
      SETUP_TRUSTED_PROXY: '127.0.0.1',
      API_PORT: String(port('API_PORT', 3101)),
      PGLITE_PORT: String(port('PGLITE_PORT', 55431)),
      APP_ORIGIN: installation!.origin,
    });
  } else await runtime();
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
  console.log(
    'V2.1: ' +
      (installation?.origin ??
        process.env.APP_ORIGIN ??
        'http://localhost:' + port('WEB_PORT', 3100)),
  );
  if (setup) {
    while (!closing && (await store.read())?.status !== 'installed')
      await new Promise((resolve) => setTimeout(resolve, 1000));
    if (!closing) {
      // Let the final setup response flush before replacing the API process.
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await halt(setup);
      const configured = parse(await readFile(environmentFile, 'utf8'));
      Object.assign(process.env, configured, externalEnvironment);
      if (process.env.DATABASE_URL && server) {
        await server.stop();
        server = undefined;
        await pglite?.close();
        pglite = undefined;
      }
      await runtime();
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Startup failed');
  await stop(1);
}
