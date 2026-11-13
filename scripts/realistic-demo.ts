import 'dotenv/config';
import path from 'node:path';
import { open, readFile, access, unlink } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { Database } from '../packages/database/src/database.js';
import { migrate } from '../packages/database/src/migrate.js';
import { port } from '../packages/database/src/config.js';
import { encryptionKey } from '../packages/domain/src/crypto.js';
import { RealisticDemo, demoConfiguration } from '../packages/domain/src/realistic-demo.js';
import { DomainError, requireCondition } from '../packages/domain/src/errors.js';
const [action, flag, expected, ...extra] = process.argv.slice(2);
if (
  !['seed', 'global-admin'].includes(action) ||
  flag !== '--database' ||
  !expected ||
  extra.length > 1 ||
  (extra.length && (action !== 'global-admin' || extra[0] !== '--check'))
)
  throw new Error(
    'Use npm run demo:seed -- --database <configured database>, or npm run demo:global-admin -- --database <configured database> [--check].',
  );
let db: Database | undefined,
  pglite: PGlite | undefined,
  server: PGLiteSocketServer | undefined,
  lock: Awaited<ReturnType<typeof open>> | undefined,
  lockPath: string | undefined;
try {
  const configuration = await demoConfiguration(expected);
  if (!process.env.DATABASE_URL) {
    lockPath = path.join(configuration.directory, 'pglite.lock');
    lock = await open(lockPath, 'wx', 0o600);
    await lock.writeFile(String(process.pid));
    pglite = await PGlite.create(expected);
    server = new PGLiteSocketServer({
      db: pglite,
      host: '127.0.0.1',
      port: port('PGLITE_PORT', 55431),
      maxConnections: 16,
    });
    await server.start();
  }
  db = new Database();
  const manifest = await access(path.join(configuration.root, 'manifest.json')).then(
    () => true,
    (error) => {
      if (error.code === 'ENOENT') return false;
      throw error;
    },
  );
  if (!manifest && action === 'seed') {
    const exists = (await db.pool.query("SELECT to_regclass('public.users') IS NOT NULL AS users"))
      .rows[0].users;
    requireCondition(
      !exists ||
        !(await db.pool.query('SELECT id FROM users UNION ALL SELECT id FROM organisations'))
          .rowCount,
      409,
      'demo_nonempty',
      'Demo generation requires an empty disposable database. Existing records were preserved.',
    );
    await migrate(db);
  }
  let key: Buffer;
  if (manifest && !process.env.APP_ENCRYPTION_KEY) {
    key = await readFile(path.join(configuration.directory, 'encryption.key'));
    requireCondition(
      key.length === 32,
      409,
      'demo_key',
      'Restore the original demo encryption key; it was not replaced.',
    );
  } else key = await encryptionKey();
  const service = new RealisticDemo(db, key, expected, (stage) => console.log(stage));
  if (action === 'seed') {
    const result = await service.seed();
    console.log(
      result.created
        ? 'Created three fictional clients, 30 mock identities and 21 training scenarios.'
        : 'Identical demo already complete; no records or audit events added.',
    );
  } else {
    const result = await service.extendAdministrator(extra[0] === '--check');
    console.log(
      result.checked
        ? 'Isolated fictional demo guard passed.'
        : 'Fictional Global Admin is available. Existing demo records were preserved.',
    );
  }
} catch (error) {
  console.error(
    error instanceof DomainError
      ? error.message
      : 'Demo command failed. Inspect the isolated configuration and workspace; no records were reset.',
  );
  process.exitCode = 1;
} finally {
  await db?.close();
  await server?.stop();
  await pglite?.close();
  await lock?.close();
  if (lock && lockPath) await unlink(lockPath);
}
