import { it, expect, vi } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { Database } from '../packages/database/src/database.js';
import { migrate } from '../packages/database/src/migrate.js';
import { Auth } from '../packages/domain/src/auth.js';
import { Tenancy } from '../packages/domain/src/tenancy.js';
import { Enrolments } from '../packages/domain/src/enrolments.js';
import { FoundationChecks } from '../packages/domain/src/foundation-checks.js';
import { claim } from '../packages/domain/src/outbox.js';
const url = process.env.TEST_POSTGRES_URL;
it.skipIf(!url)(
  'serializes repeated check requests and duplicate workers with actor-scoped PostgreSQL receipts',
  async () => {
    if (!new URL(url!).pathname.endsWith('_test'))
      throw new Error('Dedicated test cluster required.');
    const root = new Database(url),
      name = 'checks_' + randomUUID().replaceAll('-', '') + '_test',
      connection = new URL(url!);
    connection.pathname = '/' + name;
    let db: Database | undefined;
    try {
      await root.pool.query('CREATE DATABASE ' + name);
      vi.stubEnv('DATABASE_URL', connection.toString());
      db = new Database(connection.toString(), 'tracker_tenant_' + randomBytes(6).toString('hex'));
      await migrate(db);
      const auth = new Auth(db, randomBytes(32)),
        tenancy = new Tenancy(auth),
        enrolments = new Enrolments(auth),
        checks = new FoundationChecks(enrolments),
        guest = await auth.context();
      await auth.setup(guest.token!, guest.csrf, {
        name: 'Check operator',
        email: 'check-admin@example.invalid',
        password: 'Administrator fixture passphrase',
        demoPassword: 'Separate demonstration password',
      });
      async function login(email: string, password: string) {
        const g = await auth.context();
        return auth.login(g.token!, g.csrf, email, password);
      }
      const admin = await login('check-admin@example.invalid', 'Administrator fixture passphrase'),
        member = await login('demo.1.3@example.invalid', 'Separate demonstration password');
      const client = (await tenancy.choices(admin.token))[0].id;
      for (const session of [admin, member])
        await tenancy.select(session.token, session.csrf, client);
      const members = (
        await db.pool.query(
          'SELECT cm.id,cm.user_id,u.email FROM client_memberships cm JOIN users u ON u.id=cm.user_id WHERE cm.organisation_id=$1',
          [client],
        )
      ).rows;
      const learner = members.find((r) => r.email === 'demo.1.3@example.invalid')!,
        reviewer = members.find((r) => r.email === 'demo.1.2@example.invalid')!;
      const team = (await db.pool.query('SELECT id FROM groups WHERE organisation_id=$1', [client]))
        .rows[0].id;
      const record = await enrolments.create(admin.token, admin.csrf, client, {
        memberId: learner.id,
        coordinatorId: reviewer.id,
        groupId: team,
        title: 'PostgreSQL background check',
        reason: 'Check concurrent background processing',
      });
      const key = randomUUID(),
        requested = await Promise.all(
          Array.from({ length: 4 }, () =>
            checks.request(member.token, member.csrf, client, record.id, { version: 1, key }),
          ),
        );
      expect(new Set(requested.map((r) => r.id)).size).toBe(1);
      const job = (await claim(db, ['foundation.check']))!;
      const outcomes = await Promise.allSettled([checks.process(job), checks.process(job)]);
      expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(
        (await db.pool.query("SELECT id FROM foundation_checks WHERE status='delivered'")).rowCount,
      ).toBe(1);
      expect(
        (
          await db.pool.query(
            "SELECT id FROM audit_events WHERE action='foundation.check.completed'",
          )
        ).rowCount,
      ).toBe(1);
      for (const [actorId, count] of [
        [learner.user_id, 1],
        [reviewer.user_id, 0],
      ] as const)
        expect(
          await db.scoped(
            { actorId, organisationId: client, environment: 'test' },
            async (sql) => (await sql.query('SELECT id FROM foundation_checks')).rowCount,
          ),
        ).toBe(count);
      await expect(
        db.pool.query("UPDATE foundation_checks SET status='pending',receipt_at=NULL WHERE id=$1", [
          job.id,
        ]),
      ).rejects.toThrow();
    } finally {
      await db?.close();
      await root.close();
      vi.unstubAllEnvs();
    }
  },
  120000,
);
