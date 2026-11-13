import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { testDatabase } from './helpers.js';
import { Auth } from '../packages/domain/src/auth.js';
import { Tenancy } from '../packages/domain/src/tenancy.js';
import { Promotions } from '../packages/domain/src/promotions.js';
import { claim, finish, type Job } from '../packages/domain/src/outbox.js';
import type { PromotionPayload, PrimaryAdapter } from '../packages/domain/src/primary-platform.js';
let instance: Awaited<ReturnType<typeof testDatabase>>,
  auth: Auth,
  service: Promotions,
  admin: { token: string; csrf: string },
  client: string,
  other: string;
const key = randomBytes(32),
  reason = 'Verified identity and duplicate review';
let mode = 'unconfigured',
  calls: string[] = [],
  payload: PromotionPayload;
const adapter: PrimaryAdapter = {
  async createPerson(id, data) {
    calls.push(id);
    payload = data;
    if (mode === 'unconfigured') throw new Error('primary_not_configured');
    if (mode === 'timeout') throw new Error('timeout_after_acceptance');
    return response(id);
  },
  async findByKey(id) {
    calls.push(id);
    return response(id);
  },
};
function response(id: string) {
  return {
    idempotency_key: mode === 'wrong' ? randomUUID() : id,
    local_person_id: payload.local_person_id,
    person_id: mode === 'duplicate' ? 'existing-person' : 'primary-' + payload.local_person_id,
    identity: payload.identity,
  };
}
beforeAll(async () => {
  instance = await testDatabase();
  auth = new Auth(instance.db, key);
  service = new Promotions(auth, key, adapter);
  const g = await auth.context();
  await auth.setup(g.token!, g.csrf, {
    name: 'Admin',
    email: 'admin@example.invalid',
    password: 'Unique administrator passphrase',
    demoPassword: 'Separate demonstration password',
  });
  const guest = await auth.context();
  admin = await auth.login(
    guest.token!,
    guest.csrf,
    'admin@example.invalid',
    'Unique administrator passphrase',
  );
  const clients = await new Tenancy(auth).choices(admin.token);
  client = clients[0].id;
  other = clients[1].id;
  await new Tenancy(auth).select(admin.token, admin.csrf, client);
});
afterAll(async () => {
  await instance?.close();
});
async function person(synthetic = false) {
  const id = randomUUID(),
    cm = randomUUID();
  await instance.db.pool.query(
    "INSERT INTO users(id,name,email,password_hash,environment,is_synthetic) VALUES($1,'Contract fixture',$2,'disabled','test',$3)",
    [id, id + '@example.invalid', synthetic],
  );
  await instance.db.pool.query(
    "INSERT INTO identities(id,user_id,issuer,subject) VALUES($1,$2::uuid,'https://idp.example.invalid',$2::text)",
    [randomUUID(), id],
  );
  await instance.db.pool.query(
    "INSERT INTO client_memberships(id,organisation_id,environment,user_id) VALUES($1,$2,'test',$3)",
    [cm, client, id],
  );
  return id;
}
const request = (userId: string, requestKey = randomUUID()) =>
  service.request(admin.token, admin.csrf, client, { userId, key: requestKey, reason });
async function dispatch(id: string, reconcile = false) {
  await service.queue(admin.token, admin.csrf, client, id, reconcile, reason);
  const job = await claim(instance.db, ['person.promote']);
  expect(job?.payload.promotionId).toBe(id);
  return job!;
}
async function process(job: Job) {
  await service.process(job);
  await finish(instance.db, job, 'done');
}
const state = async (id: string) =>
  (await instance.db.pool.query('SELECT * FROM promotions WHERE id=$1', [id])).rows[0];
it('prepares exact idempotent private requests and rejects synthetic, scope and key conflicts', async () => {
  const user = await person(),
    requestKey = randomUUID(),
    created = await request(user, requestKey);
  expect(await request(user, requestKey)).toEqual(created);
  expect((await state(created.id)).payload).not.toContain('Contract fixture');
  expect(JSON.stringify((await service.list(admin.token, client)).items)).not.toContain('payload');
  await expect(request(await person(true))).rejects.toMatchObject({ status: 422 });
  await expect(request(await person(), requestKey)).rejects.toMatchObject({ status: 409 });
  await expect(request(user)).rejects.toMatchObject({ status: 409 });
  await expect(service.list(admin.token, other)).rejects.toMatchObject({ status: 403 });
  await expect(
    instance.db.pool.query("UPDATE promotions SET payload='replacement' WHERE id=$1", [created.id]),
  ).rejects.toThrow('immutable');
});
it('keeps unconfigured delivery prepared and reconciles ambiguity using the original key without historical export', async () => {
  const user = await person(),
    created = await request(user);
  mode = 'unconfigured';
  await process(await dispatch(created.id));
  expect((await state(created.id)).status).toBe('prepared');
  mode = 'timeout';
  await process(await dispatch(created.id));
  expect((await state(created.id)).status).toBe('ambiguous');
  await expect(
    service.queue(admin.token, admin.csrf, client, created.id, false, reason),
  ).rejects.toMatchObject({ status: 409 });
  mode = 'success';
  await process(await dispatch(created.id, true));
  expect((await state(created.id)).status).toBe('linked');
  const member = (
    await instance.db.pool.query(
      'SELECT sync_policy,external_person_id,linked_at,export_training_history FROM users WHERE id=$1',
      [user],
    )
  ).rows[0];
  expect(member).toMatchObject({
    sync_policy: 'linked',
    external_person_id: 'primary-' + user,
    export_training_history: false,
  });
  expect(member.linked_at).toBeTruthy();
  expect(new Set(calls.slice(-3)).size).toBe(1);
  // Source permits explicit history authorization for an already-linked inactive member.
  await instance.db.pool.query('UPDATE users SET active=false WHERE id=$1', [user]);
  await service.history(admin.token, admin.csrf, client, user, reason);
  expect(
    (await instance.db.pool.query('SELECT export_training_history FROM users WHERE id=$1', [user]))
      .rows[0].export_training_history,
  ).toBe(true);
});
it('quarantines wrong acknowledgements and duplicate primary mappings', async () => {
  const wrong = await request(await person());
  mode = 'wrong';
  await process(await dispatch(wrong.id));
  expect((await state(wrong.id)).status).toBe('ambiguous');
  const existing = await person();
  await instance.db.pool.query(
    "UPDATE users SET external_person_id='existing-person',sync_policy='linked' WHERE id=$1",
    [existing],
  );
  const duplicate = await request(await person());
  mode = 'duplicate';
  await process(await dispatch(duplicate.id));
  expect((await state(duplicate.id)).status).toBe('duplicate_review');
  await expect(
    service.history(admin.token, admin.csrf, client, (await state(duplicate.id)).user_id, reason),
  ).rejects.toMatchObject({ status: 409 });
});
it('rechecks identity before dispatch and current authority after the adapter returns', async () => {
  const user = await person(),
    created = await request(user),
    job = await dispatch(created.id),
    count = calls.length;
  await instance.db.pool.query('UPDATE identities SET active=false WHERE user_id=$1', [user]);
  await expect(service.process(job)).rejects.toMatchObject({ status: 409 });
  expect(calls).toHaveLength(count);
  await finish(instance.db, job, 'failed');
  const second = await request(await person());
  const revoking = new Promotions(auth, key, {
    async createPerson(id, data) {
      await instance.db.pool.query('UPDATE identities SET active=false WHERE user_id=$1', [
        data.local_person_id,
      ]);
      return {
        idempotency_key: id,
        local_person_id: data.local_person_id,
        person_id: 'must-not-link',
        identity: data.identity,
      };
    },
    async findByKey() {
      return null;
    },
  });
  const secondJob = await dispatch(second.id);
  await expect(revoking.process(secondJob)).rejects.toMatchObject({ status: 409 });
  await finish(instance.db, secondJob, 'failed');
  expect((await state(second.id)).status).toBe('sending');
  await instance.db.pool.query(
    "UPDATE promotions SET updated_at=now()-interval '181 seconds' WHERE id=$1",
    [second.id],
  );
  await service.recover();
  expect((await state(second.id)).status).toBe('ambiguous');
  expect(
    (
      await instance.db.pool.query('SELECT external_person_id FROM users WHERE id=$1', [
        (await state(second.id)).user_id,
      ])
    ).rows[0].external_person_id,
  ).toBeNull();
});
it('recovers missing queued dispatch without replaying ambiguous effects', async () => {
  // The revoked queued request from the prior case remains non-dispatchable under current authority.
  const rows = (
    await instance.db.pool.query(
      "SELECT id FROM outbox_events WHERE kind='person.promote' AND status='pending'",
    )
  ).rows;
  for (const row of rows)
    await instance.db.pool.query("UPDATE outbox_events SET status='failed' WHERE id=$1", [row.id]);
  const created = await request(await person());
  await service.queue(admin.token, admin.csrf, client, created.id, false, reason);
  await instance.db.pool.query(
    "UPDATE outbox_events SET status='failed' WHERE payload->>'promotionId'=$1",
    [created.id],
  );
  expect(await service.recover()).toBeGreaterThanOrEqual(1);
  expect(
    (
      await instance.db.pool.query(
        "SELECT id FROM outbox_events WHERE payload->>'promotionId'=$1 AND status='pending'",
        [created.id],
      )
    ).rowCount,
  ).toBe(1);
  await service.recover();
  expect(
    (
      await instance.db.pool.query(
        "SELECT id FROM outbox_events WHERE payload->>'promotionId'=$1 AND status='pending'",
        [created.id],
      )
    ).rowCount,
  ).toBe(1);
});
