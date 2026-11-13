import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { testDatabase } from './helpers.js';
import {
  seedDemoClient,
  demoIds,
  assertLocalFixtures,
  type DemoClient,
} from '../packages/domain/src/demo-client.js';
import { passwordHash, passwordMatches } from '../packages/domain/src/crypto.js';
import { demoTransaction } from '../packages/domain/src/demo-transaction.js';
import { seedDemoScenario, type DemoScenario } from '../packages/domain/src/demo-scenario.js';
import { Auth } from '../packages/domain/src/auth.js';
import { Access, globalAdmin } from '../packages/domain/src/access.js';
import type { AuthUser } from '../packages/domain/src/auth.js';
let instance: Awaited<ReturnType<typeof testDatabase>>, clients: DemoClient[], hash: string;
const installation = randomUUID(),
  reference = '2026-09-28T00:00:00.000Z';
beforeAll(async () => {
  instance = await testDatabase();
  hash = await passwordHash('Separate fictional fixture passphrase');
  clients = await instance.db.transaction(async (sql) => {
    const result = [];
    for (let index = 0; index < 3; index++)
      result.push(await seedDemoClient(sql, installation, index, hash, reference));
    return result;
  });
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await instance?.close();
});
it('preserves three source clients, thirty synthetic local identities and separate team/cohort structure', async () => {
  const users = (await instance.db.pool.query('SELECT * FROM users ORDER BY email')).rows;
  expect(users).toHaveLength(30);
  expect(users.every((u) => u.is_synthetic && u.environment === 'test' && !u.global_admin)).toBe(
    true,
  );
  expect(users[0].name).toBe('Maya Santos \u00b7 Harbor Voice Support \u00b7 admin');
  expect(
    await passwordMatches('Separate fictional fixture passphrase', users[0].password_hash),
  ).toBe(true);
  expect((await instance.db.pool.query('SELECT id FROM identities')).rowCount).toBe(30);
  expect((await instance.db.pool.query("SELECT id FROM groups WHERE kind='team'")).rowCount).toBe(
    6,
  );
  expect((await instance.db.pool.query("SELECT id FROM groups WHERE kind='cohort'")).rowCount).toBe(
    3,
  );
  expect(
    (
      await instance.db.pool.query(
        "SELECT m.id FROM client_team_memberships m JOIN groups g ON g.id=m.group_id WHERE g.kind='team' AND m.client_membership_id=$1",
        [clients[0].memberships[3]],
      )
    ).rowCount,
  ).toBe(0);
  expect(
    (
      await instance.db.pool.query(
        'SELECT default_theme FROM client_brandings WHERE organisation_id=$1',
        [clients[1].org],
      )
    ).rows[0].default_theme,
  ).toBe('client-dark');
  expect(
    (
      await instance.db.pool.query(
        "SELECT user_id FROM client_theme_preferences WHERE theme='neon-cyan'",
      )
    ).rowCount,
  ).toBe(3);
});
it('keeps coordinator authority team-scoped, backup management absent, and cohort membership non-authoritative', async () => {
  const access = new Access(),
    c = clients[0];
  const actor = async (person: number) =>
    (await instance.db.pool.query('SELECT * FROM users WHERE id=$1', [c.users[person]]))
      .rows[0] as AuthUser;
  expect(
    (
      await instance.db.pool.query(
        "SELECT id FROM role_assignments WHERE role='coordinator' AND scope_type='client'",
      )
    ).rowCount,
  ).toBe(0);
  expect(
    (
      await instance.db.pool.query(
        "SELECT id FROM role_assignments WHERE role='coordinator' AND scope_type='team'",
      )
    ).rowCount,
  ).toBe(12);
  expect(await globalAdmin(instance.db.pool, c.users[0], 'test')).toBe(false);
  expect(await access.team(instance.db.pool, c.org, 'test', c.cohort)).toBeFalsy();
  expect(
    await access.manageTraining(
      instance.db.pool,
      await actor(1),
      c.memberships[5],
      c.teams[0],
      new Date(),
    ),
  ).toBe(true);
  expect(
    await access.manageTraining(
      instance.db.pool,
      await actor(2),
      c.memberships[5],
      c.teams[0],
      new Date(),
    ),
  ).toBe(false);
  expect(await access.sensitive(instance.db.pool, await actor(1), c.memberships[5])).toBe(true);
  expect(await access.sensitive(instance.db.pool, await actor(2), c.memberships[5])).toBe(false);
  expect(
    await access.viewTraining(
      instance.db.pool,
      await actor(1),
      clients[1].memberships[5],
      clients[1].teams[0],
      new Date(),
    ),
  ).toBe(false);
});
it('uses deterministic scoped UUIDs and rolls back an interrupted client without replacing existing fixtures', async () => {
  const a = demoIds(installation, 9),
    b = demoIds(installation, 9);
  expect([a(), a()]).toEqual([b(), b()]);
  await expect(
    instance.db.transaction(async (sql) => {
      await seedDemoClient(sql, randomUUID(), 0, hash, reference);
    }),
  ).rejects.toThrow();
  expect((await instance.db.pool.query('SELECT id FROM organisations')).rowCount).toBe(3);
  for (const flag of [
    'AI_LIVE_ENABLED',
    'SMTP_ENABLED',
    'ACCOUNT_MAIL_ENABLED',
    'MOCK_IDENTITY_ENABLED',
  ]) {
    vi.stubEnv(flag, 'true');
    expect(assertLocalFixtures).toThrow();
    vi.unstubAllEnvs();
  }
  vi.stubEnv('NODE_ENV', 'production');
  expect(assertLocalFixtures).toThrow();
  vi.unstubAllEnvs();
});

it('rolls back composed service operations and restores the tenant role inside the fixture transaction', async () => {
  const before = (await instance.db.pool.query('SELECT token_hash FROM sessions')).rowCount;
  await expect(
    demoTransaction(instance.db, async (db) => {
      const auth = new Auth(db, Buffer.alloc(32, 3));
      await auth.context();
      const scope = {
        actorId: clients[0].users[0],
        organisationId: clients[0].org,
        environment: 'test' as const,
      };
      await db.scoped(scope, async (sql) =>
        expect((await sql.query('SELECT current_role AS role')).rows[0].role).toBe(
          'tracker_tenant',
        ),
      );
      expect((await db.pool.query('SELECT current_role AS role')).rows[0].role).not.toBe(
        'tracker_tenant',
      );
      await expect(
        db.transaction(async (sql) => {
          await sql.query('SELECT 1');
          throw new Error('nested rollback');
        }),
      ).rejects.toThrow('nested rollback');
      expect((await db.pool.query('SELECT 1 AS value')).rows[0].value).toBe(1);
      throw new Error('Interrupted fixture stage');
    }),
  ).rejects.toThrow('Interrupted fixture stage');
  expect((await instance.db.pool.query('SELECT token_hash FROM sessions')).rowCount).toBe(before);
});

it('creates all twenty-one source scenarios through real onboarding, delivery, grading and appeal services', async () => {
  const scenarios: DemoScenario[] = [];
  for (let client = 0; client < 3; client++)
    for (let scenario = 0; scenario < 7; scenario++) {
      scenarios.push(
        await demoTransaction(instance.db, (db) =>
          seedDemoScenario(db, Buffer.alloc(32, 3), clients[client], client, scenario, reference),
        ),
      );
    }
  expect(scenarios).toHaveLength(21);
  expect((await instance.db.pool.query('SELECT id FROM enrolments')).rowCount).toBe(21);
  expect(
    (await instance.db.pool.query("SELECT id FROM enrolments WHERE status='completed'")).rowCount,
  ).toBe(3);
  expect((await instance.db.pool.query('SELECT id FROM learning_blocks')).rowCount).toBe(60);
  expect((await instance.db.pool.query('SELECT id FROM submission_attempts')).rowCount).toBe(48);
  expect(
    (
      await instance.db.pool.query(
        "SELECT id FROM learning_appeals WHERE status='open' AND reviewer_id IS NOT NULL",
      )
    ).rowCount,
  ).toBe(3);
  expect((await instance.db.pool.query('SELECT token_hash FROM sessions')).rowCount).toBe(0);
  for (const scenario of scenarios.filter((s) => s.state === 'correction/resubmission')) {
    expect(
      (
        await instance.db.pool.query('SELECT status FROM submission_attempts WHERE id=$1', [
          scenario.previous_submission,
        ])
      ).rows[0].status,
    ).toBe('changes_requested');
    expect(
      (
        await instance.db.pool.query('SELECT status FROM submission_attempts WHERE id=$1', [
          scenario.submission,
        ])
      ).rows[0].status,
    ).toBe('submitted');
  }
}, 600000);
