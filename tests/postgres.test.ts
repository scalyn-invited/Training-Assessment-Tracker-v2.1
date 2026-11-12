import { describe, it, expect } from 'vitest';
import { Database } from '../packages/database/src/database.js';
import { migrate } from '../packages/database/src/migrate.js';
import { fixture, actor, org, other } from './helpers.js';
import { enqueue, claim } from '../packages/domain/src/outbox.js';
import { Auth, type AuthUser } from '../packages/domain/src/auth.js';
import { Platform } from '../packages/domain/src/platform.js';
import { randomUUID, randomBytes } from 'node:crypto';
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
      await db.pool.query(
        "INSERT INTO identities(id,user_id,issuer,subject) VALUES($1,$2::uuid,'urn:training:local',$2::text)",
        [randomUUID(), actor],
      );
      await db.pool.query(
        "INSERT INTO platform_client_states(organisation_id,environment) VALUES($1,'test'),($2,'test')",
        [org, other],
      );
      const second = randomUUID(),
        firstGrant = randomUUID(),
        secondGrant = randomUUID();
      await db.pool.query(
        "INSERT INTO users(id,email,name,password_hash,environment) VALUES($1,'second@example.invalid','Second','not-a-password','test')",
        [second],
      );
      await db.pool.query(
        "INSERT INTO identities(id,user_id,issuer,subject) VALUES($1,$2::uuid,'urn:training:local',$2::text)",
        [randomUUID(), second],
      );
      await db.pool.query(
        "INSERT INTO role_assignments(id,user_id,role,environment,scope_type,scope_key,granted_by,reason) VALUES($1,$2,'admin','test','platform','platform',$2,'Concurrency fixture'),($3,$4,'admin','test','platform','platform',$2,'Concurrency fixture')",
        [firstGrant, actor, secondGrant, second],
      );
      const auth = new Auth(db, randomBytes(32)),
        platform = new Platform(auth);
      const makeSession = async (id: string) =>
        db.transaction(async (sql) => {
          const user = (
            await sql.query<AuthUser>(
              'SELECT id,name,email,environment,permission_version,global_admin FROM users WHERE id=$1',
              [id],
            )
          ).rows[0];
          return auth.newSession(sql, user);
        });
      const firstSession = await makeSession(actor),
        secondSession = await makeSession(second);
      const revocations = await Promise.allSettled([
        platform.revoke(
          firstSession.token,
          firstSession.csrf,
          secondGrant,
          'Concurrent revoke test',
        ),
        platform.revoke(
          secondSession.token,
          secondSession.csrf,
          firstGrant,
          'Concurrent revoke test',
        ),
      ]);
      expect(revocations.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const surviving = (
        await db.pool.query(
          "SELECT user_id FROM role_assignments WHERE scope_type='platform' AND ends_at IS NULL",
        )
      ).rows;
      expect(surviving).toHaveLength(1);
      const survivor = surviving[0].user_id === actor ? firstSession : secondSession;
      const edits = await Promise.allSettled([
        platform.client(
          survivor.token,
          survivor.csrf,
          org,
          'First edit',
          0,
          'Concurrent rename test',
        ),
        platform.client(
          survivor.token,
          survivor.csrf,
          org,
          'Second edit',
          0,
          'Concurrent rename test',
        ),
      ]);
      expect(edits.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(edits.find((r) => r.status === 'rejected')).toMatchObject({ reason: { status: 409 } });
    } finally {
      await db.close();
    }
  });
});
