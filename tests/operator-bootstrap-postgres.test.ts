import { it, expect, vi } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { Database } from '../packages/database/src/database.js';
import { migrate } from '../packages/database/src/migrate.js';
import { Auth } from '../packages/domain/src/auth.js';
import { Accounts } from '../packages/domain/src/accounts.js';
import { OperatorBootstrap } from '../packages/domain/src/operator-bootstrap.js';
const url = process.env.TEST_POSTGRES_URL;
it.skipIf(!url)(
  'serializes production initialization and one-use bootstrap redemption on PostgreSQL',
  async () => {
    if (!new URL(url!).pathname.endsWith('_test'))
      throw new Error('Dedicated test cluster required.');
    const root = new Database(url),
      name = 'bootstrap_' + randomUUID().replaceAll('-', '') + '_test',
      connection = new URL(url!);
    connection.pathname = '/' + name;
    let db: Database | undefined;
    try {
      await root.pool.query('CREATE DATABASE ' + name);
      vi.stubEnv('DATABASE_URL', connection.toString());
      db = new Database(connection.toString(), 'tracker_tenant_' + randomBytes(6).toString('hex'));
      await migrate(db);
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('TRAINING_ENVIRONMENT', 'production');
      vi.stubEnv('TRAINING_AUTH_MODE', 'local_password');
      vi.stubEnv('TRAINING_INSTALL_MODE', 'hosted');
      vi.stubEnv('APP_ORIGIN', 'https://bootstrap.example.invalid');
      vi.stubEnv('MOCK_IDENTITY_ENABLED', 'false');
      const auth = new Auth(db, randomBytes(32)),
        service = new OperatorBootstrap(auth),
        accounts = new Accounts(auth);
      const links = await Promise.all(
        Array.from({ length: 3 }, () =>
          service.initializeProduction(
            'hosted',
            'Concurrent Owner',
            'owner@bootstrap.example.invalid',
            'test-operator',
            'Concurrent initial setup rehearsal',
          ),
        ),
      );
      expect((await db.pool.query('SELECT id FROM users')).rowCount).toBe(1);
      expect((await db.pool.query('SELECT id FROM role_assignments')).rowCount).toBe(1);
      expect(
        (
          await db.pool.query(
            "SELECT id FROM platform_audit_events WHERE action='local.production.initialized'",
          )
        ).rowCount,
      ).toBe(1);
      const active = (
        await db.pool.query('SELECT id FROM local_account_links WHERE revoked_at IS NULL')
      ).rows;
      expect(active).toHaveLength(1);
      const link = links.find((item) => item.id === active[0].id)!;
      const guests = await Promise.all([auth.context(), auth.context()]);
      const results = await Promise.allSettled(
        guests.map((guest) =>
          accounts.redeem(
            guest.token!,
            guest.csrf,
            link.token,
            'setup',
            'Concurrent initial setup password',
            'Concurrent initial setup password',
          ),
        ),
      );
      expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((item) => item.status === 'rejected')).toHaveLength(1);
      expect(
        (
          await db.pool.query(
            "SELECT id FROM platform_audit_events WHERE action='local.setup.consumed'",
          )
        ).rowCount,
      ).toBe(1);
      expect((await db.pool.query('SELECT id FROM client_memberships')).rowCount).toBe(0);
      await expect(
        service.initializeProduction(
          'hosted',
          'Concurrent Owner',
          'owner@bootstrap.example.invalid',
          'test-operator',
          'No lost admin recovery bypass',
        ),
      ).rejects.toMatchObject({ code: 'production_setup_closed' });
      const user = (await db.pool.query('SELECT id FROM users')).rows[0];
      await expect(
        db.scoped(
          { actorId: user.id, organisationId: randomUUID(), environment: 'production' },
          async (sql) => (await sql.query('SELECT id FROM local_account_links')).rowCount,
        ),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await db?.close();
      vi.unstubAllEnvs();
      await root.pool.query('DROP DATABASE IF EXISTS ' + name + ' WITH (FORCE)');
      await root.close();
    }
  },
  120000,
);
