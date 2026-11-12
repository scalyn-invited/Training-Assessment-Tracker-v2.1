import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { testDatabase } from './helpers.js';
import { Auth } from '../packages/domain/src/auth.js';
import { Platform } from '../packages/domain/src/platform.js';
import { Tenancy } from '../packages/domain/src/tenancy.js';
describe('platform administration authority and version guards', () => {
  let instance: Awaited<ReturnType<typeof testDatabase>>,
    auth: Auth,
    platform: Platform,
    tenancy: Tenancy,
    session: { token: string; csrf: string },
    adminId: string,
    grantId: string,
    otherId: string,
    client: string;
  const reason = 'Approved local administration';
  beforeAll(async () => {
    instance = await testDatabase();
    auth = new Auth(instance.db, randomBytes(32));
    platform = new Platform(auth);
    tenancy = new Tenancy(auth);
    const guest = await auth.context();
    await auth.setup(guest.token!, guest.csrf, {
      name: 'Admin',
      email: 'admin@example.invalid',
      password: 'Unique administrator passphrase',
      demoPassword: 'Separate demonstration password',
    });
    session = await auth.login(
      guest.token!,
      guest.csrf,
      'admin@example.invalid',
      'Unique administrator passphrase',
    );
    adminId = (await auth.context(session.token)).user!.id;
    grantId = (
      await instance.db.pool.query(
        "SELECT id FROM role_assignments WHERE user_id=$1 AND scope_type='platform'",
        [adminId],
      )
    ).rows[0].id;
    otherId = (
      await instance.db.pool.query("SELECT id FROM users WHERE email='demo.1.0@example.invalid'")
    ).rows[0].id;
    client = (
      await instance.db.pool.query(
        'SELECT organisation_id FROM client_memberships WHERE user_id=$1',
        [otherId],
      )
    ).rows[0].organisation_id;
  });
  afterAll(async () => {
    await instance?.close();
  });
  it('protects the last active administrator', async () => {
    await expect(
      platform.revoke(session.token, session.csrf, grantId, reason),
    ).rejects.toMatchObject({ code: 'last_administrator' });
    const appointed = await platform.appoint(session.token, session.csrf, otherId, reason);
    await instance.db.pool.query('UPDATE identities SET active=false WHERE user_id=$1', [otherId]);
    await expect(
      platform.revoke(session.token, session.csrf, grantId, reason),
    ).rejects.toMatchObject({ code: 'last_administrator' });
    await instance.db.pool.query('UPDATE identities SET active=true WHERE user_id=$1', [otherId]);
    await platform.revoke(session.token, session.csrf, appointed.id, reason);
    expect((await auth.context(session.token)).user?.global_admin).toBe(true);
  });
  it('guards exact client versions and records a reason', async () => {
    const created = await platform.client(
      session.token,
      session.csrf,
      null,
      'New isolated client',
      0,
      reason,
    );
    expect(created.version).toBe(1);
    await platform.client(session.token, session.csrf, created.id, 'Renamed client', 1, reason);
    await expect(
      platform.client(session.token, session.csrf, created.id, 'Stale name', 1, reason),
    ).rejects.toMatchObject({ status: 409 });
    const row = (
      await instance.db.pool.query('SELECT name FROM organisations WHERE id=$1', [created.id])
    ).rows[0];
    expect(row.name).toBe('Renamed client');
    expect(
      (
        await instance.db.pool.query(
          'SELECT reason FROM platform_audit_events WHERE target_id=$1',
          [created.id],
        )
      ).rows.every((r) => r.reason === reason),
    ).toBe(true);
  });
  it('requires client role for sensitive access even for Global Admin', async () => {
    const allocation = (
      await instance.db.pool.query(
        'SELECT id FROM coordinator_allocations WHERE organisation_id=$1 LIMIT 1',
        [client],
      )
    ).rows[0];
    await expect(
      tenancy.sensitive(session.token, session.csrf, client, allocation.id, true, reason),
    ).rejects.toMatchObject({ status: 403 });
    const guest = await auth.context();
    const local = await auth.login(
      guest.token!,
      guest.csrf,
      'demo.1.0@example.invalid',
      'Separate demonstration password',
    );
    const grant = await tenancy.sensitive(
      local.token,
      local.csrf,
      client,
      allocation.id,
      true,
      reason,
    );
    expect(grant.id).toBeTruthy();
    await tenancy.endAllocation(session.token, session.csrf, client, allocation.id, reason);
    expect(
      (
        await instance.db.pool.query('SELECT ends_at FROM client_sensitive_grants WHERE id=$1', [
          grant.id,
        ])
      ).rows[0].ends_at,
    ).not.toBeNull();
  });
  it('suspension revokes users and stops work without reactivation resurrecting it', async () => {
    const guest = await auth.context();
    const local = await auth.login(
      guest.token!,
      guest.csrf,
      'demo.1.3@example.invalid',
      'Separate demonstration password',
    );
    const job = randomUUID();
    await instance.db.pool.query(
      "INSERT INTO outbox_events(id,organisation_id,environment,actor_id,kind,idempotency_key,payload_hash,payload) VALUES($1::uuid,$2,'test',$3,'test',$1::text,'hash','{}')",
      [job, client, adminId],
    );
    await platform.client(session.token, session.csrf, client, 'Demo Client 1', 0, reason, true);
    expect((await auth.context(local.token)).user).toBeNull();
    expect((await tenancy.choices(session.token)).some((c) => c.id === client)).toBe(false);
    await platform.client(session.token, session.csrf, client, 'Demo Client 1', 1, reason, false);
    expect(
      (await instance.db.pool.query('SELECT status FROM outbox_events WHERE id=$1', [job])).rows[0]
        .status,
    ).toBe('failed');
  });

  it('filters directory totals and counts effective access before pagination', async () => {
    const result = await platform.directory(session.token, 'Demo Client 1', 1, 'active');
    expect(result.total).toBe(1);
    expect(result.clients[0].members).toBe(10);
    expect(result.clients[0].admins).toBe(1);
    const outOfRange = await platform.directory(session.token, 'Demo Client 1', 99, 'active');
    expect(outOfRange.total).toBe(1);
    expect(outOfRange.clients).toEqual([]);
    expect((await platform.directory(session.token, 'Demo Client 1', 1, 'suspended')).total).toBe(
      0,
    );
  });
  it('ending membership checks version and ends dependent authority', async () => {
    const row = (
      await instance.db.pool.query('SELECT id,version FROM client_memberships WHERE user_id=$1', [
        otherId,
      ])
    ).rows[0];
    await expect(
      tenancy.leave(session.token, session.csrf, client, row.id, 999, reason),
    ).rejects.toMatchObject({ status: 409 });
    await tenancy.leave(session.token, session.csrf, client, row.id, row.version, reason);
    expect(
      (
        await instance.db.pool.query(
          'SELECT id FROM role_assignments WHERE client_membership_id=$1 AND ends_at IS NULL',
          [row.id],
        )
      ).rows,
    ).toHaveLength(0);
  });
});
