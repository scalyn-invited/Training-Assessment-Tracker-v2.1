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
  it('lists effective administrators and searches eligible accounts without exposing credentials', async () => {
    const result = await platform.administrators(session.token, 'admin@example.invalid');
    expect(result.activeAdmins).toBe(1);
    expect(result.accounts).toHaveLength(1);
    expect(Object.keys(result.accounts[0]).sort()).toEqual([
      'email',
      'global_admin',
      'id',
      'name',
      'permission_version',
    ]);
    expect(result.accounts[0].global_admin).toBe(true);
    expect((await platform.administrators(session.token, 'admin@example.invalid', 99)).total).toBe(
      1,
    );
    expect(
      (await platform.administrators(session.token, 'admin@example.invalid', 99)).accounts,
    ).toEqual([]);
    await instance.db.pool.query('UPDATE identities SET active=false WHERE user_id=$1', [otherId]);
    expect((await platform.administrators(session.token, 'demo.1.0@example.invalid')).total).toBe(
      0,
    );
    await instance.db.pool.query('UPDATE identities SET active=true WHERE user_id=$1', [otherId]);
  });

  it('rejects stale appointment confirmation without granting, auditing or invalidating again', async () => {
    const selected = (await platform.administrators(session.token, 'demo.1.0@example.invalid'))
      .accounts[0];
    const before = (
      await instance.db.pool.query('SELECT count(*)::int n FROM platform_audit_events')
    ).rows[0].n;
    await instance.db.pool.query(
      'UPDATE users SET permission_version=permission_version+1 WHERE id=$1',
      [otherId],
    );
    await expect(
      platform.appoint(session.token, session.csrf, otherId, reason, selected.permission_version),
    ).rejects.toMatchObject({ code: 'account_version_conflict', status: 409 });
    await expect(
      platform.appoint(session.token, session.csrf, otherId, reason, 0),
    ).rejects.toMatchObject({ code: 'account_version_required', status: 422 });
    expect(
      (
        await instance.db.pool.query(
          "SELECT id FROM role_assignments WHERE user_id=$1 AND scope_type='platform'",
          [otherId],
        )
      ).rowCount,
    ).toBe(0);
    expect(
      (await instance.db.pool.query('SELECT permission_version FROM users WHERE id=$1', [otherId]))
        .rows[0].permission_version,
    ).toBe(selected.permission_version + 1);
    expect(
      (await instance.db.pool.query('SELECT count(*)::int n FROM platform_audit_events')).rows[0].n,
    ).toBe(before);
  });
  it('protects the last active administrator', async () => {
    await expect(
      platform.revoke(session.token, session.csrf, grantId, reason),
    ).rejects.toMatchObject({ code: 'last_administrator' });
    const appointed = await platform.appoint(
      session.token,
      session.csrf,
      otherId,
      reason,
      (await instance.db.pool.query('SELECT permission_version FROM users WHERE id=$1', [otherId]))
        .rows[0].permission_version,
    );
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
  it('filters audit events and totals by environment before pagination', async () => {
    await instance.db.pool.query(
      "INSERT INTO platform_audit_events(id,environment,actor_id,action,target_id,reason,created_at) VALUES($1,'test',$2,'fixture.audit','target-a','Searchable reason','2026-01-02T23:59:59Z'),($3,'production',NULL,'private.production','target-a','Searchable reason','2026-01-02T12:00:00Z')",
      [randomUUID(), adminId, randomUUID()],
    );
    const result = await platform.history(session.token, {
      query: 'Searchable',
      target: 'target-a',
      actor: 'Admin',
      from: '2026-01-02',
      to: '2026-01-02',
    });
    expect(result.total).toBe(1);
    expect(result.events[0].action).toBe('fixture.audit');
    expect(result.actions).not.toContain('private.production');
    expect((await platform.history(session.token, { query: 'Searchable', page: 2 })).total).toBe(1);
    expect(
      (await platform.history(session.token, { query: 'Searchable', page: 2 })).events,
    ).toEqual([]);
    await expect(platform.history(session.token, { from: '2026-02-30' })).rejects.toMatchObject({
      status: 422,
    });
    await expect(
      platform.history(session.token, { from: '2026-02-01', to: '2026-01-01' }),
    ).rejects.toMatchObject({ status: 422 });
  });
  it('exposes only source-approved audit change fields', async () => {
    await instance.db.pool.query(
      "INSERT INTO platform_audit_events(id,environment,actor_id,action,target_id,reason,changes) VALUES($1,'test',$2,'fixture.secret','safe-target','Projection verification',$3)",
      [
        randomUUID(),
        adminId,
        {
          before: { name: 'Old', password: 'private' },
          after: { name: 'New' },
          token: 'private',
          accent: { before: '#ffffff', after: '#000000', secret: 'private' },
          grant_id: 'internal',
        },
      ],
    );
    const result = await platform.history(session.token, { action: 'fixture.secret' });
    expect(result.events[0].changes).toEqual({
      name: { before: 'Old', after: 'New' },
      accent: { before: '#ffffff', after: '#000000' },
    });
  });

  it('denies audit history to a standard client account', async () => {
    const guest = await auth.context();
    const member = await auth.login(
      guest.token!,
      guest.csrf,
      'demo.1.3@example.invalid',
      'Separate demonstration password',
    );
    await expect(platform.administrators(member.token)).rejects.toMatchObject({ status: 403 });
    await expect(platform.history(member.token)).rejects.toMatchObject({ status: 403 });
  });
});
