import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { testDatabase, fixture, actor, org, other } from './helpers.js';
import { migrate } from '../packages/database/src/migrate.js';
import { enqueue, claim, finish } from '../packages/domain/src/outbox.js';
describe('foundation on a shared PGlite socket', () => {
  let instance: Awaited<ReturnType<typeof testDatabase>>;
  const scope = { actorId: actor, organisationId: org, environment: 'test' as const };
  beforeAll(async () => {
    instance = await testDatabase();
    await fixture(instance.db);
  });
  afterAll(async () => {
    await instance?.close();
  });
  it('idle connection failure reports only a safe message and permits later queries', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      instance.db.pool.emit('error', new Error('private connection details'));
      expect(warn).toHaveBeenCalledExactlyOnceWith(
        'An idle database connection closed. New requests will reconnect.',
      );
      expect((await instance.db.pool.query('SELECT 1 AS value')).rows[0].value).toBe(1);
    } finally {
      warn.mockRestore();
    }
  });
  it('reapplying unchanged migrations is safe', async () => {
    expect((await instance.db.pool.query('SHOW search_path')).rows[0].search_path).toBe('public');
    const before = await instance.db.pool.query(
      'SELECT name,sha256 FROM schema_migrations ORDER BY name',
    );
    await migrate(instance.db);
    const r = await instance.db.pool.query('SELECT * FROM schema_migrations');
    expect(
      r.rows
        .map(({ name, sha256 }) => ({ name, sha256 }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    ).toEqual(before.rows);
  });
  it('tenant transactions only return their client', async () => {
    const rows = await instance.db.scoped(
      scope,
      async (sql) => (await sql.query('SELECT organisation_id FROM client_memberships')).rows,
    );
    expect(rows).toEqual([{ organisation_id: org }]);
  });
  it('tenant audit writes cannot target another client', async () => {
    await expect(
      instance.db.scoped(scope, (sql) =>
        sql.query(
          'INSERT INTO audit_events(id,organisation_id,environment,actor_id,action,target_id) VALUES($1,$2,$3,$4,$5,$6)',
          [randomUUID(), other, 'test', actor, 'test', 'test'],
        ),
      ),
    ).rejects.toThrow();
  });
  it('transaction rollback prevents orphaned background effects', async () => {
    const key = randomUUID();
    await expect(
      instance.db.scoped(scope, async (sql) => {
        await enqueue(sql, scope, 'test', key, { value: 1 });
        throw new Error('Rollback');
      }),
    ).rejects.toThrow('Rollback');
    expect(
      (await instance.db.pool.query('SELECT id FROM outbox_events WHERE idempotency_key=$1', [key]))
        .rows,
    ).toHaveLength(0);
  });
  it('same request returns same job, changed payload conflicts', async () => {
    const key = randomUUID();
    const id = await instance.db.scoped(scope, (sql) =>
      enqueue(sql, scope, 'test', key, { a: 1, b: 2 }),
    );
    expect(
      await instance.db.scoped(scope, (sql) => enqueue(sql, scope, 'test', key, { b: 2, a: 1 })),
    ).toBe(id);
    await expect(
      instance.db.scoped(scope, (sql) => enqueue(sql, scope, 'test', key, { a: 3 })),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('a claimed job cannot be claimed or completed twice', async () => {
    const job = await claim(instance.db);
    expect(job).toBeDefined();
    expect(await claim(instance.db)).toBeUndefined();
    await finish(instance.db, job!, 'done');
    await expect(finish(instance.db, job!, 'done')).rejects.toMatchObject({ code: 'lease_lost' });
  });
  it('an expired in-flight effect becomes uncertain instead of retrying', async () => {
    await instance.db.scoped(scope, (sql) =>
      enqueue(sql, scope, 'external-effect', randomUUID(), {}),
    );
    const job = await claim(instance.db);
    await instance.db.pool.query(
      "UPDATE outbox_events SET lease_until=now()-interval '1 second' WHERE id=$1",
      [job!.id],
    );
    expect(await claim(instance.db)).toBeUndefined();
    expect(
      (await instance.db.pool.query('SELECT status FROM outbox_events WHERE id=$1', [job!.id]))
        .rows[0].status,
    ).toBe('uncertain');
  });
  it('scope does not survive rollback or leak into subsequent transactions', async () => {
    await expect(
      instance.db.scoped(scope, async () => {
        throw new Error('rollback');
      }),
    ).rejects.toThrow();
    const rows = await instance.db.transaction(async (sql) => {
      await sql.query('SET LOCAL ROLE tracker_tenant');
      return (await sql.query('SELECT * FROM client_memberships')).rows;
    });
    expect(rows).toHaveLength(0);
  });
});
