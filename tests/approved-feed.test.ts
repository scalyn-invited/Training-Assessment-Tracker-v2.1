import { MockIdentity } from '../packages/domain/src/mock-identity.js';
import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { testDatabase } from './helpers.js';
import { ApprovedFeed } from '../packages/domain/src/approved-feed.js';
import type { AuthUser } from '../packages/domain/src/auth.js';
let instance: Awaited<ReturnType<typeof testDatabase>>;
const feed = new ApprovedFeed(),
  client = randomUUID(),
  other = randomUUID(),
  member = randomUUID(),
  coordinator = randomUUID(),
  membership = randomUUID(),
  enrolment = randomUUID();
const actor: AuthUser = {
  id: member,
  name: 'Fixture',
  email: 'feed@example.invalid',
  global_admin: false,
  permission_version: 1,
  environment: 'production',
};
beforeAll(async () => {
  instance = await testDatabase();
  const sql = instance.db.pool;
  await sql.query(
    "INSERT INTO organisations(id,name) VALUES($1,'Feed fixture'),($2,'Other fixture')",
    [client, other],
  );
  await sql.query(
    "INSERT INTO platform_client_states(organisation_id,environment) VALUES($1,'production'),($2,'production')",
    [client, other],
  );
  for (const id of [member, coordinator]) {
    await sql.query(
      "INSERT INTO users(id,name,email,password_hash,environment,is_synthetic,sync_policy,external_person_id,linked_at) VALUES($1::uuid,'Fixture',$2,'disabled','production',false,'linked',$1::text,now()+interval '1 day')",
      [id, id + '@example.invalid'],
    );
    await sql.query(
      "INSERT INTO identities(id,user_id,issuer,subject) VALUES($1,$2::uuid,'urn:test:verified',$2::text)",
      [randomUUID(), id],
    );
  }
  await sql.query(
    "INSERT INTO client_memberships(id,organisation_id,environment,user_id) VALUES($1,$2,'production',$3)",
    [membership, client, member],
  );
  await sql.query(
    "INSERT INTO role_assignments(id,user_id,role,organisation_id,environment,client_membership_id,scope_type,scope_key,granted_by,reason) VALUES($1,$2,'member',$3,'production',$4,'client',$5,$2,'Isolated fixture')",
    [randomUUID(), member, client, membership, 'client:' + client],
  );
  await sql.query(
    "INSERT INTO enrolments(id,organisation_id,environment,member_id,member_membership_id,coordinator_id,title,status) VALUES($1,$2,'production',$3,$4,$5,'Fixture','completed')",
    [enrolment, client, member, membership, coordinator],
  );
  for (let n = 1; n <= 3; n++)
    await sql.query(
      "INSERT INTO approved_changes(event_id,organisation_id,environment,enrolment_id,entity_id,entity_version,kind,facts) VALUES($1,$2,'production',$3,$4,$5,'completed',$6)",
      [randomUUID(), client, enrolment, enrolment, n, JSON.stringify({ approved: true })],
    );
});
afterAll(async () => {
  await instance?.close();
});
it('filters history before pagination and retains exact approved facts and provenance', async () => {
  const sql = instance.db.pool;
  expect((await feed.read(sql, actor, client)).items).toEqual([]);
  await sql.query('UPDATE users SET export_training_history=true WHERE id=$1', [member]);
  const page = await feed.read(sql, actor, client, 0, 2);
  expect(page.items).toHaveLength(2);
  expect(page.items[0]).toMatchObject({
    enrolment_id: enrolment,
    entity_id: enrolment,
    version: 1,
    kind: 'completed',
    facts: { approved: true },
  });
  expect((await feed.read(sql, actor, client, page.next_cursor, 2)).items).toHaveLength(1);
  expect((await feed.summary(sql, actor, client)).items).toEqual([{ enrolment_id: enrolment }]);
  await sql.query(
    "UPDATE users SET export_training_history=false,linked_at=now()-interval '1 day' WHERE id=$1",
    [member],
  );
  expect((await feed.read(sql, actor, client)).items).toHaveLength(3);
});
it('excludes local-only records and rechecks current client, membership, version and freshness', async () => {
  const sql = instance.db.pool;
  await sql.query("UPDATE users SET sync_policy='local_only' WHERE id=$1", [member]);
  expect((await feed.read(sql, actor, client)).items).toEqual([]);
  await sql.query("UPDATE users SET sync_policy='linked' WHERE id=$1", [member]);
  await expect(feed.read(sql, actor, other)).rejects.toMatchObject({ status: 404 });
  await expect(feed.summary(sql, actor, client, coordinator)).rejects.toMatchObject({
    status: 404,
  });
  await expect(feed.read(sql, { ...actor, permission_version: 0 }, client)).rejects.toMatchObject({
    status: 401,
  });
  await sql.query(
    "UPDATE users SET origin='primary_import',permissions_synced_at=now()-interval '6 minutes' WHERE id=$1",
    [member],
  );
  await expect(feed.read(sql, actor, client)).rejects.toMatchObject({ status: 503 });
  await sql.query("UPDATE users SET origin='manual' WHERE id=$1", [member]);
  await sql.query('UPDATE platform_client_states SET suspended=true WHERE organisation_id=$1', [
    client,
  ]);
  await expect(feed.read(sql, actor, client)).rejects.toMatchObject({ status: 404 });
  await sql.query('UPDATE platform_client_states SET suspended=false WHERE organisation_id=$1', [
    client,
  ]);
  await sql.query("UPDATE client_memberships SET status='ended',ended_at=now() WHERE id=$1", [
    membership,
  ]);
  await expect(feed.read(sql, actor, client)).rejects.toMatchObject({ status: 404 });
});

it('resolves immutable synthetic identities and excludes their training from external summaries', async () => {
  const sql = instance.db.pool,
    id = randomUUID(),
    cm = randomUUID(),
    coach = randomUUID(),
    syntheticClient = randomUUID();
  const issuer = 'https://identity.example.invalid/mock';
  for (const userId of [id, coach]) {
    await sql.query(
      "INSERT INTO users(id,name,email,password_hash,environment,is_synthetic) VALUES($1,'Synthetic',$2,'disabled','test',true)",
      [userId, userId + '@example.invalid'],
    );
    await sql.query(
      'INSERT INTO identities(id,user_id,issuer,subject) VALUES($1,$2::uuid,$3,$2::text)',
      [randomUUID(), userId, issuer],
    );
  }
  await sql.query("INSERT INTO organisations(id,name) VALUES($1,'Synthetic integration')", [
    syntheticClient,
  ]);
  await sql.query(
    "INSERT INTO platform_client_states(organisation_id,environment) VALUES($1,'test')",
    [syntheticClient],
  );
  await sql.query(
    "INSERT INTO client_memberships(id,organisation_id,environment,user_id) VALUES($1,$2,'test',$3)",
    [cm, syntheticClient, id],
  );
  await sql.query(
    "INSERT INTO role_assignments(id,user_id,role,organisation_id,environment,client_membership_id,scope_type,scope_key,granted_by,reason) VALUES($1,$2,'member',$3,'test',$4,'client',$5,$2,'Fixture')",
    [randomUUID(), id, syntheticClient, cm, 'client:' + syntheticClient],
  );
  await sql.query(
    "INSERT INTO enrolments(id,organisation_id,environment,member_id,member_membership_id,coordinator_id,title,status) VALUES($1,$2,'test',$3,$4,$5,'Synthetic','completed')",
    [randomUUID(), syntheticClient, id, cm, coach],
  );
  const mock = new MockIdentity(randomBytes(32));
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('TRAINING_AUTH_MODE', 'mock');
  vi.stubEnv('MOCK_IDENTITY_ENABLED', 'true');
  vi.stubEnv('TRAINING_ENVIRONMENT', 'test');
  try {
    const synthetic = await mock.resolve(sql, issuer, id);
    const token = await mock.issue(sql, synthetic);
    expect((await mock.verify(sql, token, 'training.self.read')).id).toBe(id);
    expect((await feed.summary(sql, synthetic, syntheticClient)).items).toEqual([]);
    await expect(mock.resolve(sql, 'urn:test:verified', member)).rejects.toMatchObject({
      status: 401,
    });
    await expect(mock.resolve(sql, issuer, 'unmapped')).rejects.toMatchObject({ status: 401 });
    await sql.query('UPDATE identities SET active=false WHERE user_id=$1', [id]);
    await expect(mock.verify(sql, token, 'training.self.read')).rejects.toMatchObject({
      status: 401,
    });
    await sql.query('UPDATE identities SET active=true WHERE user_id=$1', [id]);
    await sql.query('UPDATE users SET active=false WHERE id=$1', [id]);
    await expect(mock.verify(sql, token, 'training.self.read')).rejects.toMatchObject({
      status: 401,
    });
  } finally {
    vi.unstubAllEnvs();
  }
});
