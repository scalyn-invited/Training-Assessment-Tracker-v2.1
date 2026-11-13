import { randomBytes } from 'node:crypto';
import { open, readFile, rename, unlink, realpath, readdir } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { Database, Sql } from '../../database/src/database.js';
import { databaseUrl, privatePath } from '../../database/src/config.js';
import { assertFixtureMode, seedDemoClient, demoIds } from './demo-client.js';
import { seedDemoScenario } from './demo-scenario.js';
import { demoTransaction } from './demo-transaction.js';
import { LocalDemoFixtures, type DemoProgress } from './local-demo-fixtures.js';
import { digest, passwordHash } from './crypto.js';
import { requireCondition } from './errors.js';
import { Access, globalAdmin, effective } from './access.js';

const namespace = '385a83b2-78f4-55a1-960b-2c184790a486';
const reference = '2026-09-14T08:00:00.000Z';
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const manifestSchema = z.object({
  status: z.literal('complete'),
  version: z.string(),
  source: hashSchema,
  reference: z.iso.datetime(),
  snapshot: hashSchema,
  files: z.record(z.uuid(), hashSchema).refine((files) => Object.keys(files).length === 42),
  clients: z
    .array(
      z.object({
        org: z.uuid(),
        users: z.array(z.uuid()).length(10),
        memberships: z.array(z.uuid()).length(10),
        teams: z.array(z.uuid()).length(2),
        cohort: z.uuid(),
        grants: z.record(z.string(), z.uuid()),
      }),
    )
    .length(3),
  scenarios: z
    .array(
      z.object({
        enrolment: z.uuid(),
        state: z.string(),
        programme: z.uuid().optional(),
        draft: z.uuid().optional(),
        submission: z.uuid().optional(),
        previous_submission: z.uuid().optional(),
        appeal: z.uuid().optional(),
      }),
    )
    .length(21),
});
export type DemoManifest = z.infer<typeof manifestSchema>;
/** Configuration-only checks run before a CLI opens or creates any database. */
export async function demoConfiguration(expected: string) {
  assertFixtureMode('mock');
  requireCondition(
    !process.env.MIGRATION_DATABASE_URL,
    403,
    'demo_database',
    'Demo generation must not use a separate migration database connection.',
  );
  const configuredRoot = process.env.TRAINING_DEMO_ROOT;
  requireCondition(
    configuredRoot && expected && expected === process.env.TRAINING_DEMO_DATABASE,
    403,
    'demo_configuration',
    'Explicit demo database and isolated configuration must match.',
  );
  const root = await realpath(path.resolve(configuredRoot));
  const runtime = await realpath(path.resolve('.runtime'));
  const relative = path.relative(runtime, root);
  requireCondition(
    relative &&
      !relative.startsWith('..') &&
      !path.isAbsolute(relative) &&
      relative.split(path.sep)[0].startsWith('realistic-demo'),
    403,
    'demo_root',
    'Use a dedicated .runtime/realistic-demo workspace.',
  );
  const directory = await realpath(path.join(root, 'private'));
  requireCondition(
    directory === path.join(root, 'private') && directory === (await realpath(privatePath())),
    403,
    'demo_storage',
    'Demo private storage must be the dedicated workspace private directory.',
  );
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    requireCondition(
      process.env.NODE_ENV === 'test' &&
        decodeURIComponent(url.pathname.slice(1)) === expected &&
        /^[a-z][a-z0-9_]*_test$/.test(expected),
      403,
      'demo_database',
      'PostgreSQL demo generation requires an explicitly named test database in test mode.',
    );
  } else {
    requireCondition(
      path.resolve(expected) === path.join(directory, 'pglite'),
      403,
      'demo_database',
      'PGlite demos require the dedicated private/pglite directory.',
    );
  }
  return { root, directory, expected };
}
function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString('hex');
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
export class RealisticDemo {
  static readonly version = 'v2.1-realistic-demo-v1';
  static readonly administratorId = '71cfe6b1-e25c-5a29-950c-8ffdd9f92b10';
  constructor(
    readonly db: Database,
    readonly key: Buffer,
    readonly expected: string,
    readonly progress: (stage: string) => void = () => {},
  ) {}
  async guard() {
    const configuration = await demoConfiguration(this.expected);
    requireCondition(
      this.db.pool.options.connectionString === databaseUrl(),
      403,
      'demo_database',
      'The active database connection does not match the isolated demo configuration.',
    );
    const actual = (await this.db.pool.query<{ name: string }>('SELECT current_database() AS name'))
      .rows[0].name;
    requireCondition(
      actual === (process.env.DATABASE_URL ? this.expected : 'postgres'),
      403,
      'demo_database',
      'The active database does not match the isolated demo configuration.',
    );
    requireCondition(
      !(
        await this.db.pool.query(
          "SELECT id FROM users WHERE NOT is_synthetic OR environment<>'test' LIMIT 1",
        )
      ).rowCount,
      403,
      'demo_real_data',
      'Non-synthetic data detected. The workspace was preserved.',
    );
    return configuration;
  }
  async sourceHash() {
    const base = path.resolve('packages/domain/src');
    const files = [
      'realistic-demo.ts',
      'demo-client.ts',
      'demo-session.ts',
      'demo-transaction.ts',
      'demo-scenario.ts',
      'demo-catalogue.ts',
      'local-demo-fixtures.ts',
    ].map((name) => path.join(base, name));
    const migrations = path.resolve('packages/database/migrations');
    files.push(
      ...(await readdir(migrations))
        .filter((name) => name.endsWith('.sql'))
        .map((name) => path.join(migrations, name)),
    );
    const hashes = [];
    for (const file of files.sort()) hashes.push(digest(await readFile(file)));
    return digest(hashes.join(''));
  }
  async snapshot(sql: Sql = this.db.pool) {
    const excluded = new Set([
      'schema_migrations',
      'sessions',
      'rate_limits',
      'auth_attempts',
      'outbox_events',
      'worker_heartbeats',
    ]);
    const tables = (
      await sql.query<{ name: string }>(
        "SELECT tablename AS name FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
      )
    ).rows;
    const result: Record<string, string> = {};
    for (const { name } of tables) {
      if (excluded.has(name)) continue;
      const rows = (await sql.query('SELECT * FROM public."' + name.replaceAll('"', '""') + '"'))
        .rows;
      result[name] = digest(
        JSON.stringify(rows.map((row) => JSON.stringify(canonical(row))).sort()),
      );
    }
    return digest(JSON.stringify(result));
  }
  private async atomic(file: string, value: unknown) {
    const temporary = file + '.' + randomBytes(12).toString('hex') + '.tmp';
    const handle = await open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(JSON.stringify(value, null, 2));
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await rename(temporary, file);
    } catch (error) {
      await unlink(temporary).catch(() => {});
      throw error;
    }
  }
  private async locked<T>(root: string, work: () => Promise<T>) {
    const file = path.join(root, 'seed.lock');
    let handle;
    try {
      handle = await open(file, 'wx', 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      requireCondition(
        false,
        409,
        'demo_locked',
        'Another demo operation or an interrupted seed owns this workspace. Inspect it; do not reset existing records.',
      );
    }
    try {
      await handle!.writeFile(String(process.pid));
      return await work();
    } finally {
      await handle!.close();
      await unlink(file);
    }
  }
  async seed() {
    const configuration = await this.guard();
    return this.locked(configuration.root, async () => {
      const file = path.join(configuration.root, 'manifest.json'),
        source = await this.sourceHash();
      let bytes: string | undefined;
      try {
        bytes = await readFile(file, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      if (bytes !== undefined) {
        let manifest: DemoManifest;
        try {
          manifest = manifestSchema.parse(JSON.parse(bytes));
        } catch {
          requireCondition(
            false,
            409,
            'demo_changed',
            'Changed or partial demo: use a fresh disposable workspace.',
          );
        }
        requireCondition(
          manifest!.version === RealisticDemo.version &&
            manifest!.source === source &&
            manifest!.reference === reference &&
            manifest!.snapshot === (await this.snapshot()),
          409,
          'demo_changed',
          'Changed or partial demo: use a fresh disposable workspace.',
        );
        for (const [storage, hash] of Object.entries(manifest!.files)) {
          const actual = await readFile(
            path.join(configuration.directory, 'evidence', storage),
          ).catch(() => null);
          requireCondition(
            actual && digest(actual) === hash,
            409,
            'demo_evidence_changed',
            'Demo evidence changed; use a fresh disposable workspace.',
          );
        }
        return { created: false, manifest: manifest! };
      }
      requireCondition(
        !(await this.db.pool.query('SELECT id FROM users UNION ALL SELECT id FROM organisations'))
          .rowCount,
        409,
        'demo_nonempty',
        'Demo generation requires an empty migrated disposable database.',
      );
      await this.atomic(file, { status: 'building', source, version: RealisticDemo.version });
      const hash = await passwordHash(randomBytes(32).toString('hex'));
      this.progress('Starting fixture transaction');
      const manifest = await demoTransaction(
        this.db,
        async (db) => {
          const progress: DemoProgress = {
            next: 0,
            reference,
            clients: [],
            scenarios: [],
            files: {},
          };
          const content = new LocalDemoFixtures(db, this.key, configuration.directory);
          for (let index = 0; index < 3; index++)
            progress.clients.push(
              await seedDemoClient(db.pool, namespace, index, hash, reference, 'mock'),
            );
          this.progress('Three clients prepared');
          for (let index = 0; index < 21; index++) {
            this.progress('Preparing scenario ' + (index + 1) + '/21');
            const client = Math.floor(index / 7),
              scenario = index % 7;
            const created = await seedDemoScenario(
              db,
              this.key,
              progress.clients[client],
              client,
              scenario,
              reference,
              'mock',
            );
            progress.scenarios.push(created);
            Object.assign(
              progress.files,
              await content.evidence(
                db,
                namespace,
                index + 3,
                progress.clients[client],
                client,
                scenario,
                created.enrolment,
                reference,
              ),
            );
          }
          this.progress('Finalizing cross-client and departure history');
          await content.finalize(db, namespace, progress, 'mock');
          this.progress('Computing fixture snapshot');
          // This marker opens normal sign-in; the referenced Client Admin receives no platform role.
          await db.pool.query('INSERT INTO installation(singleton,admin_id) VALUES(true,$1)', [
            progress.clients[0].users[0],
          ]);
          return {
            status: 'complete' as const,
            version: RealisticDemo.version,
            source,
            reference,
            snapshot: await this.snapshot(db.pool),
            files: progress.files,
            clients: progress.clients,
            scenarios: progress.scenarios,
          };
        },
        'mock',
      );
      this.progress('Saving completed manifest');
      await this.atomic(file, manifest);
      return { created: true, manifest };
    });
  }
  async extendAdministrator(check = false) {
    const configuration = await this.guard();
    return this.locked(configuration.root, async () => {
      const manifest = JSON.parse(
        await readFile(path.join(configuration.root, 'manifest.json'), 'utf8'),
      );
      requireCondition(
        manifest.status === 'complete' &&
          !(
            await this.db.pool.query(
              "SELECT id FROM users WHERE email NOT LIKE '%.invalid' LIMIT 1",
            )
          ).rowCount,
        409,
        'demo_incomplete',
        'A complete fictional demo is required.',
      );
      if (check) return { created: false, checked: true };
      return this.db.transaction(async (sql) => {
        await sql.query(
          "SELECT environment FROM platform_settings WHERE environment='test' FOR UPDATE",
        );
        const id = RealisticDemo.administratorId,
          email = 'global.admin@platform-demo.invalid';
        const existing = (await sql.query('SELECT * FROM users WHERE id=$1', [id])).rows[0];
        if (existing) {
          requireCondition(
            existing.email === email &&
              existing.is_synthetic &&
              existing.environment === 'test' &&
              (await new Access().active(sql, id, 'test')) &&
              (await globalAdmin(sql, id, 'test')),
            409,
            'demo_extension_changed',
            'Existing extension changed. Review manually; no automatic regrant.',
          );
          return { created: false, checked: false };
        }
        requireCondition(
          !(await sql.query('SELECT id FROM users WHERE email=$1', [email])).rowCount &&
            !(
              await sql.query(
                "SELECT id FROM role_assignments WHERE environment='test' AND role='admin' AND scope_type='platform' AND " +
                  effective,
              )
            ).rowCount,
          409,
          'demo_extension_changed',
          'Unexpected platform administrator. Review before extension.',
        );
        await sql.query(
          "INSERT INTO users(id,name,email,password_hash,environment,is_synthetic) VALUES($1,$2,$3,$4,'test',true)",
          [
            id,
            'Alex Rowan \u2014 Fictional Global Admin',
            email,
            await passwordHash(randomBytes(32).toString('hex')),
          ],
        );
        await sql.query('INSERT INTO identities(id,user_id,issuer,subject) VALUES($1,$2,$3,$4)', [
          '98cde696-c982-5ae3-a2fd-8ccce812c023',
          id,
          process.env.MOCK_IDENTITY_ISSUER ?? 'https://identity.example.invalid/mock',
          'demo-platform-global-admin',
        ]);
        const next = demoIds(namespace, 50),
          grant = next();
        await sql.query(
          "INSERT INTO role_assignments(id,user_id,role,environment,scope_type,scope_key,granted_by,reason) VALUES($1,$2,'admin','test','platform','platform',$2,$3)",
          [grant, id, 'Approved fictional Global Admin demo extension'],
        );
        await sql.query(
          "INSERT INTO platform_audit_events(id,environment,operator_reference,action,target_id,reason,changes) VALUES($1,'test','demo-extension-v1','platform.admin.appointed',$2,$3,$4)",
          [
            next(),
            id,
            'Approved fictional Global Admin demo extension',
            JSON.stringify({ grant_id: grant }),
          ],
        );
        return { created: true, checked: false };
      });
    });
  }
}
