import { it, expect, vi } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Database } from '../packages/database/src/database.js';
import { migrate } from '../packages/database/src/migrate.js';
import {
  InstallationDatabase,
  installationRole,
} from '../packages/domain/src/installation-database.js';
import { LocalDemoFixtures } from '../packages/domain/src/local-demo-fixtures.js';
import { passwordHash } from '../packages/domain/src/crypto.js';
const url = process.env.TEST_POSTGRES_URL;
it.skipIf(!url)(
  'serializes owned fixture stages and preserves custom-role PostgreSQL isolation through all scenarios',
  async () => {
    if (!new URL(url!).pathname.endsWith('_test'))
      throw new Error('Fixture qualification requires the dedicated test cluster.');
    const root = new Database(url),
      installation = randomUUID(),
      name = 'demo_' + installation.replaceAll('-', '') + '_test',
      database = new URL(url!);
    database.pathname = '/' + name;
    const state = {
      id: installation,
      mode: 'hosted' as const,
      status: 'installing' as const,
      key: randomBytes(32).toString('hex'),
      origin: 'https://setup.example.test',
      createdAt: Date.now(),
    };
    const directory = await mkdtemp(path.join(tmpdir(), 'tracker-demo-postgres-'));
    let db: Database | undefined;
    try {
      // New unique database only; the existing qualification database is never reset.
      await root.pool.query('CREATE DATABASE ' + name);
      db = new Database(database.toString(), installationRole(state));
      await new InstallationDatabase().claim(db, state);
      await migrate(db);
      await db.pool.query("UPDATE training_installations SET stage='migrated'");
      const service = new LocalDemoFixtures(db, Buffer.from(state.key, 'hex'), directory),
        hash = await passwordHash('Separate fictional fixture passphrase');
      const starts = await Promise.all([
        service.advance(installation, hash),
        service.advance(installation, hash),
      ]);
      expect(starts.map((s) => s.next).sort()).toEqual([1, 2]);
      expect((await db.pool.query('SELECT id FROM users')).rowCount).toBe(20);
      let progress = await service.advance(installation, hash);
      console.log('PostgreSQL fixture stages saved: ' + progress.next + '/25');
      while (progress.next < 25) {
        progress = await service.advance(installation, hash);
        if (progress.next % 5 === 0)
          console.log('PostgreSQL fixture stages saved: ' + progress.next + '/25');
      }
      expect(progress.scenarios).toHaveLength(21);
      expect(Object.keys(progress.files)).toHaveLength(42);
      expect(
        (await db.pool.query("SELECT id FROM enrolments WHERE status='completed'")).rowCount,
      ).toBe(3);
      const client = progress.clients[0],
        rows = await db.scoped(
          { actorId: client.users[1], organisationId: client.org, environment: 'test' },
          async (sql) => (await sql.query('SELECT organisation_id FROM evidence_files')).rows,
        );
      expect(rows).toHaveLength(14);
      expect(rows.every((r) => r.organisation_id === client.org)).toBe(true);
      expect((await db.pool.query('SELECT token_hash FROM sessions')).rowCount).toBe(0);
      const done = await Promise.all([
        service.advance(installation, hash),
        service.advance(installation, hash),
      ]);
      expect(done.every((p) => p.next === 25)).toBe(true);
      expect((await db.pool.query('SELECT id FROM users')).rowCount).toBe(30);
    } finally {
      await db?.close();
      await root.close();
      if (
        path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep) &&
        path.basename(directory).startsWith('tracker-demo-postgres-')
      )
        await rm(directory, { recursive: true, force: true });
    }
  },
  240000,
);

it.skipIf(!url)(
  'qualifies isolated mock manifest replay and explicit administrator extension on PostgreSQL',
  async () => {
    if (!new URL(url!).pathname.endsWith('_test'))
      throw new Error('Dedicated test cluster required.');
    const { RealisticDemo } = await import('../packages/domain/src/realistic-demo.js');
    const root = new Database(url);
    const name = 'mock_demo_' + randomUUID().replaceAll('-', '') + '_test';
    const connection = new URL(url!);
    connection.pathname = '/' + name;
    const directory = path.resolve('.runtime/realistic-demo-postgres', name);
    let db: Database | undefined;
    try {
      await mkdir(path.join(directory, 'private'), { recursive: true });
      await root.pool.query('CREATE DATABASE ' + name);
      vi.stubEnv('DATABASE_URL', connection.toString());
      vi.stubEnv('MIGRATION_DATABASE_URL', '');
      vi.stubEnv('NODE_ENV', 'test');
      vi.stubEnv('TRAINING_AUTH_MODE', 'mock');
      vi.stubEnv('MOCK_IDENTITY_ENABLED', 'true');
      vi.stubEnv('TRAINING_ENVIRONMENT', 'test');
      vi.stubEnv('TRAINING_DEMO_ENABLED', 'true');
      vi.stubEnv('TRAINING_DEMO_DATABASE', name);
      vi.stubEnv('TRAINING_DEMO_ROOT', directory);
      vi.stubEnv('PRIVATE_STORAGE_PATH', path.join(directory, 'private'));
      for (const flag of [
        'AI_LIVE_ENABLED',
        'AI_ANTHROPIC_ENABLED',
        'AI_GEMINI_ENABLED',
        'SMTP_ENABLED',
        'ACCOUNT_MAIL_ENABLED',
        'RETENTION_APPROVED',
      ])
        vi.stubEnv(flag, 'false');
      db = new Database(connection.toString(), 'tracker_tenant_' + randomBytes(6).toString('hex'));
      await migrate(db);
      const service = new RealisticDemo(db, randomBytes(32), name, console.log);
      expect((await service.seed()).created).toBe(true);
      expect((await service.seed()).created).toBe(false);
      expect((await db.pool.query('SELECT id FROM users')).rowCount).toBe(30);
      expect((await service.extendAdministrator(true)).checked).toBe(true);
      expect((await service.extendAdministrator()).created).toBe(true);
      expect((await service.extendAdministrator()).created).toBe(false);
      expect((await db.pool.query('SELECT id FROM users')).rowCount).toBe(31);
      await expect(service.seed()).rejects.toMatchObject({ code: 'demo_changed' });
    } finally {
      await db?.close();
      await root.close();
      vi.unstubAllEnvs();
      if (directory.startsWith(path.resolve('.runtime/realistic-demo-postgres') + path.sep))
        await rm(directory, { recursive: true, force: true });
    }
  },
  600000,
);
