import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { testDatabase } from './helpers.js';
import { MockIdentity } from '../packages/domain/src/mock-identity.js';
import { SandboxDirectory } from '../packages/domain/src/sandbox-directory.js';
let instance: Awaited<ReturnType<typeof testDatabase>>, directory: SandboxDirectory;
const client = randomUUID(),
  other = randomUUID();
const event = (
  entity: string,
  version = 1,
  type = 'person.upserted',
  payload: Record<string, unknown> = { display_name: 'Imported fixture', active: true },
) => ({
  event_id: randomUUID(),
  entity_id: entity,
  entity_version: version,
  environment: 'test',
  source: 'primary-platform',
  event_type: type,
  payload,
});
beforeAll(async () => {
  instance = await testDatabase();
  directory = new SandboxDirectory(instance.db, new MockIdentity(randomBytes(32)));
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('TRAINING_AUTH_MODE', 'mock');
  vi.stubEnv('TRAINING_ENVIRONMENT', 'test');
  vi.stubEnv('MOCK_IDENTITY_ENABLED', 'true');
  await instance.db.pool.query(
    "INSERT INTO organisations(id,name) VALUES($1,'Directory A'),($2,'Directory B')",
    [client, other],
  );
  await instance.db.pool.query(
    "INSERT INTO platform_client_states(organisation_id,environment) VALUES($1,'test'),($2,'test')",
    [client, other],
  );
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await instance?.close();
});
it('commits whole pages before cursors and preserves semantic duplicate identity', async () => {
  const good = event('atomic');
  await expect(
    directory.page(client, null, 'page1', [
      good,
      event('broken', 1, 'person.upserted', { active: true }),
    ]),
  ).rejects.toBeTruthy();
  expect((await instance.db.pool.query('SELECT * FROM directory_people')).rowCount).toBe(0);
  expect((await instance.db.pool.query('SELECT * FROM inbound_events')).rowCount).toBe(0);
  expect((await instance.db.pool.query('SELECT * FROM integration_cursors')).rowCount).toBe(0);
  await directory.page(client, null, 'page1', [good]);
  expect(
    (await instance.db.pool.query('SELECT cursor FROM integration_cursors')).rows[0].cursor,
  ).toBe('page1');
  await expect(directory.page(client, null, 'page2', [])).rejects.toMatchObject({ status: 409 });
  expect(
    await directory.apply(client, {
      ...good,
      payload: { active: true, display_name: 'Imported fixture' },
    }),
  ).toBe('duplicate');
  await expect(
    directory.apply(client, {
      ...good,
      payload: { active: false, display_name: 'Imported fixture' },
    }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(directory.apply(other, good)).rejects.toMatchObject({ status: 409 });
  const user = (
    await instance.db.pool.query("SELECT * FROM users WHERE external_person_id='atomic'")
  ).rows[0];
  expect(user).toMatchObject({
    is_synthetic: true,
    origin: 'primary_import',
    sync_policy: 'linked',
    password_enabled: false,
    directory_version: 1,
  });
  expect(
    (await instance.db.pool.query('SELECT * FROM identities WHERE user_id=$1', [user.id])).rowCount,
  ).toBe(0);
  expect(
    (await instance.db.pool.query('SELECT * FROM role_assignments WHERE user_id=$1', [user.id]))
      .rowCount,
  ).toBe(0);
  expect(
    (await instance.db.pool.query('SELECT * FROM client_memberships WHERE user_id=$1', [user.id]))
      .rowCount,
  ).toBe(0);
});
it('revokes access on deactivation and never revives roles or sessions on re-entry', async () => {
  const sql = instance.db.pool;
  await directory.apply(client, event('revoke'));
  const user = (await sql.query("SELECT * FROM users WHERE external_person_id='revoke'")).rows[0];
  const cm = randomUUID();
  await sql.query(
    "INSERT INTO client_memberships(id,organisation_id,environment,user_id) VALUES($1,$2,'test',$3)",
    [cm, client, user.id],
  );
  await sql.query(
    "INSERT INTO role_assignments(id,user_id,role,organisation_id,environment,client_membership_id,scope_type,scope_key,granted_by,reason) VALUES($1,$2,'member',$3,'test',$4,'client',$5,$2,'Fixture')",
    [randomUUID(), user.id, client, cm, 'client:' + client],
  );
  await sql.query(
    "INSERT INTO sessions(token_hash,user_id,csrf,permission_version) VALUES('fixture-token',$1,'fixture-csrf',$2)",
    [user.id, user.permission_version],
  );
  expect(await directory.apply(client, event('revoke', 2, 'person.deactivated', {}))).toBe(
    'applied',
  );
  expect(
    (await sql.query('SELECT active,directory_version FROM users WHERE id=$1', [user.id])).rows[0],
  ).toMatchObject({ active: false, directory_version: 2 });
  expect((await sql.query('SELECT * FROM sessions WHERE user_id=$1', [user.id])).rowCount).toBe(0);
  expect(
    (await sql.query('SELECT ends_at FROM role_assignments WHERE user_id=$1', [user.id])).rows[0]
      .ends_at,
  ).toBeTruthy();
  expect(await directory.apply(client, event('revoke', 1))).toBe('stale');
  expect((await sql.query('SELECT active FROM users WHERE id=$1', [user.id])).rows[0].active).toBe(
    false,
  );
  await directory.apply(client, event('revoke', 3));
  expect((await sql.query('SELECT active FROM users WHERE id=$1', [user.id])).rows[0].active).toBe(
    true,
  );
  expect(
    (await sql.query('SELECT ends_at FROM role_assignments WHERE user_id=$1', [user.id])).rows[0]
      .ends_at,
  ).toBeTruthy();
});
it('requires explicit directory membership mappings and preserves ended app periods', async () => {
  const sql = instance.db.pool,
    user = (await sql.query("SELECT * FROM users WHERE external_person_id='revoke'")).rows[0];
  const cm = (await sql.query('SELECT id FROM client_memberships WHERE user_id=$1', [user.id]))
      .rows[0].id,
    group = randomUUID();
  await sql.query(
    "INSERT INTO groups(id,organisation_id,environment,name,kind,origin) VALUES($1,$2,'test','Imported team','team','primary_import')",
    [group, client],
  );
  const payload = { person_source_id: 'revoke', group_id: group, active: false };
  await expect(
    directory.apply(client, event('membership', 1, 'membership.changed', payload)),
  ).rejects.toMatchObject({ status: 422 });
  await sql.query(
    "INSERT INTO directory_memberships(id,organisation_id,environment,user_id,group_id) VALUES($1,$2,'test',$3,$4)",
    [randomUUID(), client, user.id, group],
  );
  await sql.query(
    "INSERT INTO client_team_memberships(id,organisation_id,environment,client_membership_id,group_id) VALUES($1,$2,'test',$3,$4)",
    [randomUUID(), client, cm, group],
  );
  await directory.apply(client, event('membership', 1, 'membership.changed', payload));
  expect(
    (await sql.query('SELECT ends_at FROM client_team_memberships WHERE group_id=$1', [group]))
      .rows[0].ends_at,
  ).toBeTruthy();
  await directory.apply(
    client,
    event('membership', 2, 'membership.changed', { ...payload, active: true }),
  );
  expect(
    (await sql.query('SELECT ends_at FROM directory_memberships WHERE group_id=$1', [group]))
      .rows[0].ends_at,
  ).toBeNull();
  expect(
    (await sql.query('SELECT ends_at FROM client_team_memberships WHERE group_id=$1', [group]))
      .rows[0].ends_at,
  ).toBeTruthy();
});
it('rejects disabled harnesses and production inputs', async () => {
  await expect(
    directory.apply(client, { ...event('no'), environment: 'production' }),
  ).rejects.toBeTruthy();
  vi.stubEnv('NODE_ENV', 'production');
  try {
    await expect(directory.apply(client, event('no'))).rejects.toMatchObject({ status: 503 });
  } finally {
    vi.stubEnv('NODE_ENV', 'test');
  }
});
