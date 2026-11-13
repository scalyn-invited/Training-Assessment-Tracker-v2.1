import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { testDatabase } from './helpers.js';
import { Auth, type AuthUser } from '../packages/domain/src/auth.js';
import { Tenancy } from '../packages/domain/src/tenancy.js';
import { Access } from '../packages/domain/src/access.js';
describe('effective client and historical team authority', () => {
  let instance: Awaited<ReturnType<typeof testDatabase>>,
    auth: Auth,
    tenancy: Tenancy,
    admin: { token: string; csrf: string };
  let client: string,
    other: string,
    member: any,
    coordinator: any,
    clientAdmin: any,
    team: string,
    recorded: Date;
  const access = new Access(),
    reason = 'Verified tenancy maintenance',
    password = 'Separate demonstration password';
  async function login(email: string, p = password) {
    const guest = await auth.context();
    return auth.login(guest.token!, guest.csrf, email, p);
  }
  beforeAll(async () => {
    instance = await testDatabase();
    auth = new Auth(instance.db, randomBytes(32));
    tenancy = new Tenancy(auth);
    const guest = await auth.context();
    await auth.setup(guest.token!, guest.csrf, {
      name: 'Admin',
      email: 'admin@example.invalid',
      password: 'Unique administrator passphrase',
      demoPassword: password,
    });
    admin = await login('admin@example.invalid', 'Unique administrator passphrase');
    const users = (
      await instance.db.pool.query(
        "SELECT u.*,cm.id membership_id,cm.organisation_id FROM users u JOIN client_memberships cm ON cm.user_id=u.id WHERE email IN ('demo.1.0@example.invalid','demo.1.2@example.invalid','demo.1.3@example.invalid')",
      )
    ).rows;
    member = users.find((u) => u.email === 'demo.1.3@example.invalid');
    coordinator = users.find((u) => u.email === 'demo.1.2@example.invalid');
    clientAdmin = users.find((u) => u.email === 'demo.1.0@example.invalid');
    client = member.organisation_id;
    other = (
      await instance.db.pool.query('SELECT id FROM organisations WHERE id<>$1 LIMIT 1', [client])
    ).rows[0].id;
    team = (
      await instance.db.pool.query('SELECT id FROM groups WHERE organisation_id=$1', [client])
    ).rows[0].id;
    recorded = new Date();
  });
  afterAll(async () => {
    await instance?.close();
  });
  it('keeps client choices scoped and rejects cross-client selection', async () => {
    const session = await login(member.email);
    expect((await tenancy.choices(session.token)).map((c) => c.id)).toEqual([client]);
    await expect(tenancy.select(session.token, session.csrf, other)).rejects.toMatchObject({
      status: 404,
    });
    expect(await tenancy.select(session.token, session.csrf, client)).toEqual({ clientId: client, csrf: session.csrf });
    expect(await tenancy.choices(admin.token)).toHaveLength(3);
  });
  it('scopes administration lists to the selected authorized client', async () => {
    const local = await login(clientAdmin.email);
    await tenancy.select(local.token, local.csrf, client);
    const result = await tenancy.administration(local.token, client, 'demo.1.3');
    expect(result.total).toBe(1);
    expect(result.people[0].id).toBe(member.membership_id);
    expect(result.groups.every((group) => group.id !== other)).toBe(true);
    expect(Object.keys(result.people[0]).sort()).toEqual([
      'active',
      'email',
      'export_training_history',
      'external_person_id',
      'id',
      'is_synthetic',
      'name',
      'origin',
      'permission_version',
      'sync_policy',
      'user_id',
      'version',
    ]);
    expect((await tenancy.administration(local.token, client, 'demo.1.3', 99)).people).toEqual([]);
    await expect(tenancy.administration(local.token, other)).rejects.toMatchObject({ status: 403 });
    const ordinary = await login(member.email);
    await tenancy.select(ordinary.token, ordinary.csrf, client);
    await expect(tenancy.administration(ordinary.token, client)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('excludes inactive people from directory rows, counts and training candidates without changing membership history', async () => {
    await tenancy.select(admin.token, admin.csrf, client);
    const before = await tenancy.administration(admin.token, client);
    const membership = (await instance.db.pool.query('SELECT * FROM client_memberships WHERE id=$1', [member.membership_id])).rows[0];
    await instance.db.pool.query('UPDATE users SET active=false WHERE id=$1', [member.id]);
    try {
      const directory = await tenancy.administration(admin.token, client);
      expect(directory.total).toBe(before.total - 1);
      expect(directory.people.some(p => p.user_id === member.id)).toBe(false);
      expect(directory.candidates.some(p => p.id === member.membership_id)).toBe(false);
      const search = await tenancy.administration(admin.token, client, member.email);
      expect(search.total).toBe(0); expect(search.people).toEqual([]);
      expect((await instance.db.pool.query('SELECT * FROM client_memberships WHERE id=$1', [member.membership_id])).rows[0]).toEqual(membership);
    } finally {
      await instance.db.pool.query('UPDATE users SET active=true WHERE id=$1', [member.id]);
    }
    expect((await tenancy.administration(admin.token, client)).total).toBe(before.total);
  });
  it('does not infer platform authority from the legacy user flag', async () => {
    await instance.db.pool.query('UPDATE users SET global_admin=true WHERE id=$1', [member.id]);
    const session = await login(member.email);
    expect((await auth.context(session.token)).user?.global_admin).toBe(false);
    await expect(
      tenancy.createGroup(session.token, session.csrf, client, 'Unauthorized', 'team', reason),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('permits own records and allocated review but not administrative raw access', async () => {
    await instance.db.transaction(async (sql) => {
      expect(await access.viewTraining(sql, member, member.membership_id, team, recorded)).toBe(
        true,
      );
      expect(
        await access.manageTraining(sql, coordinator, member.membership_id, team, recorded),
      ).toBe(true);
      expect(
        await access.viewTraining(sql, clientAdmin, member.membership_id, team, recorded),
      ).toBe(false);
      expect(await access.manageTraining(sql, member, member.membership_id, team, recorded)).toBe(
        false,
      );
    });
  });
  it('denies cross-client roles and protects client-admin grants', async () => {
    await expect(
      tenancy.grantRole(
        admin.token,
        admin.csrf,
        other,
        member.membership_id,
        'member',
        null,
        reason,
      ),
    ).rejects.toMatchObject({ status: 404 });
    const session = await login(clientAdmin.email);
    await expect(
      tenancy.grantRole(
        session.token,
        session.csrf,
        client,
        member.membership_id,
        'admin',
        null,
        reason,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('team removal revokes sessions and rejoining does not restore historical review', async () => {
    const session = await login(coordinator.email);
    await tenancy.teamMembership(
      admin.token,
      admin.csrf,
      client,
      member.membership_id,
      team,
      false,
      reason,
    );
    expect((await auth.context(session.token)).user).toBeNull();
    await tenancy.teamMembership(
      admin.token,
      admin.csrf,
      client,
      member.membership_id,
      team,
      true,
      reason,
    );
    await instance.db.transaction(async (sql) => {
      expect(
        await access.viewTraining(sql, coordinator, member.membership_id, team, recorded),
      ).toBe(false);
      expect(await access.viewTraining(sql, member, member.membership_id, team, recorded)).toBe(
        true,
      );
    });
  });
  it('ending a coordinator role ends allocations without reviving them on regrant', async () => {
    const role = (
      await instance.db.pool.query(
        "SELECT id FROM role_assignments WHERE user_id=$1 AND scope_type='client' AND role='coordinator'",
        [coordinator.id],
      )
    ).rows[0];
    await tenancy.revokeRole(admin.token, admin.csrf, client, role.id, reason);
    await tenancy.grantRole(
      admin.token,
      admin.csrf,
      client,
      coordinator.membership_id,
      'coordinator',
      null,
      reason,
    );
    const allocation = (
      await instance.db.pool.query(
        'SELECT ends_at FROM coordinator_allocations WHERE coordinator_membership_id=$1',
        [coordinator.membership_id],
      )
    ).rows[0];
    expect(allocation.ends_at).not.toBeNull();
    await instance.db.transaction(async (sql) => {
      const membership = await access.membership(sql, member.id, client, 'test');
      expect(await access.allocated(sql, coordinator, membership!)).toBe(false);
    });
  });
  it('requires explicit allocation replacement and rejects self-review', async () => {
    await expect(
      tenancy.allocate(
        admin.token,
        admin.csrf,
        client,
        member.membership_id,
        member.membership_id,
        'primary',
        reason,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await tenancy.allocate(
      admin.token,
      admin.csrf,
      client,
      member.membership_id,
      coordinator.membership_id,
      'primary',
      reason,
    );
    await expect(
      tenancy.allocate(
        admin.token,
        admin.csrf,
        client,
        member.membership_id,
        coordinator.membership_id,
        'backup',
        reason,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('denies stale imported permissions even with a valid session', async () => {
    const session = await login(member.email);
    await instance.db.pool.query(
      "UPDATE users SET origin='primary_import',permissions_synced_at=now()-interval '6 minutes' WHERE id=$1",
      [member.id],
    );
    expect((await auth.context(session.token)).user).toBeNull();
    await expect(login(member.email)).rejects.toMatchObject({ status: 401 });
  });
  it('filters tenant role and team rows before returning results', async () => {
    const rows = await instance.db.scoped(
      { actorId: clientAdmin.id, organisationId: other, environment: 'test' },
      async (sql) => (await sql.query('SELECT organisation_id FROM role_assignments')).rows,
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.organisation_id === other)).toBe(true);
  });
});
