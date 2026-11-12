import { describe, it, expect } from 'vitest';
import { Database } from '../packages/database/src/database.js';
import { migrate } from '../packages/database/src/migrate.js';
import { fixture, actor, org, other } from './helpers.js';
import { enqueue, claim } from '../packages/domain/src/outbox.js';
import { randomUUID } from 'node:crypto';
const url = process.env.TEST_POSTGRES_URL;
describe.skipIf(!url)('real PostgreSQL isolation and concurrency', () => {
  it('uses a dedicated empty test database, enforces RLS, and claims jobs once', async () => {
    if (!new URL(url!).pathname.endsWith('_test'))
      throw new Error('TEST_POSTGRES_URL database must end with _test');
    const db = new Database(url);
    try {
      const tables = await db.pool.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='public'",
      );
      if (tables.rowCount)
        throw new Error(
          'PostgreSQL qualification requires a new empty test database; nothing was changed.',
        );
      await migrate(db);
      await fixture(db);
      const scope = { actorId: actor, organisationId: org, environment: 'test' as const };
      const results = await Promise.all(
        [org, other].map((organisationId) =>
          db.scoped(
            { ...scope, organisationId },
            async (sql) => (await sql.query('SELECT organisation_id FROM client_memberships')).rows,
          ),
        ),
      );
      expect(results).toEqual([[{ organisation_id: org }], [{ organisation_id: other }]]);
      await db.scoped(scope, (sql) => enqueue(sql, scope, 'test', randomUUID(), {}));
      const claims = await Promise.all([claim(db), claim(db)]);
      expect(claims.filter(Boolean)).toHaveLength(1);
    } finally {
      await db.close();
    }
  });
});
