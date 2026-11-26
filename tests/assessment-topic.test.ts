import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { testDatabase } from './helpers.js';
import { Auth } from '../packages/domain/src/auth.js';
import { Tenancy } from '../packages/domain/src/tenancy.js';
import { Enrolments } from '../packages/domain/src/enrolments.js';
import { AssessmentDefinitions } from '../packages/domain/src/assessment-definitions.js';
import { AiGateway } from '../packages/domain/src/ai-gateway.js';
import { AiRegistry, aiConfig } from '../packages/domain/src/ai-registry.js';
import * as module from '../packages/domain/src/assessment-topic-generation.js';
import { claim, finish } from '../packages/domain/src/outbox.js';
import { Database } from '../packages/database/src/database.js';
import { migrate } from '../packages/database/src/migrate.js';
import { mockProvider, ProviderFailure } from '../packages/domain/src/ai-provider.js';
let instance: Awaited<ReturnType<typeof testDatabase>>,
  definitions: AssessmentDefinitions,
  gateway: AiGateway,
  service: any;
let session: { token: string; csrf: string }, client: string;
beforeAll(async () => {
  if (process.env.TEST_POSTGRES_URL) {
    if (!new URL(process.env.TEST_POSTGRES_URL).pathname.endsWith('_test'))
      throw Error('Dedicated test database required.');
    const db = new Database(process.env.TEST_POSTGRES_URL);
    if ((await db.pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rowCount)
      throw Error('Empty PostgreSQL test database required.');
    await migrate(db);
    instance = { db, close: () => db.close() };
  } else instance = await testDatabase();
  const key = randomBytes(32),
    auth = new Auth(instance.db, key),
    tenancy = new Tenancy(auth);
  definitions = new AssessmentDefinitions(auth, key);
  const guest = await auth.context();
  await auth.setup(guest.token!, guest.csrf, {
    name: 'Admin',
    email: 'admin@example.invalid',
    password: 'Unique administrator passphrase',
    demoPassword: 'Separate demonstration password',
  });
  const g = await auth.context();
  session = await auth.login(
    g.token!,
    g.csrf,
    'demo.1.2@example.invalid',
    'Separate demonstration password',
  );
  client = (await tenancy.choices(session.token))[0].id;
  await tenancy.select(session.token, session.csrf, client);
  gateway = new AiGateway(
    new AiRegistry(new Enrolments(auth), () => ({
      ...aiConfig(),
      authoringLimit: 1000000,
      authoringCallLimit: 10,
    })),
    key,
  );
});
afterAll(async () => {
  await instance?.close();
});
it('rejects arbitrary topics, invalid options and disabled shared allowance', async () => {
  const generation = new module.AssessmentTopicGeneration(definitions, gateway);
  await expect(
    generation.request(session.token, session.csrf, client, randomUUID(), {
      topic: 'Customer private topic',
    }),
  ).rejects.toMatchObject({ code: 'synthetic_topic_only' });
  const disabled = new AiGateway(
    new AiRegistry(gateway.registry.enrolments, () => ({ ...aiConfig(), authoringCallLimit: 0 })),
    gateway.key,
  );
  const service = new module.AssessmentTopicGeneration(definitions, disabled);
  await expect(
    service.request(session.token, session.csrf, client, randomUUID(), {
      topic: 'Cedar workshop safety',
    }),
  ).rejects.toMatchObject({ code: 'authoring_call_limit' });
});
it('queues a real authoring-scoped run, replays idempotency and delivers five reviewed proposals without saving', async () => {
  expect(typeof module.AssessmentTopicGeneration).toBe('function');
  service = new module.AssessmentTopicGeneration(definitions, gateway);
  const key = randomUUID(),
    input = { topic: 'Cedar workshop safety' };
  const run = await service.request(session.token, session.csrf, client, key, input);
  expect(run.status).toBe('queued');
  expect((await service.request(session.token, session.csrf, client, key, input)).id).toBe(run.id);
  await expect(
    service.request(session.token, session.csrf, client, randomUUID(), input),
  ).rejects.toMatchObject({ code: 'authoring_active' });
  const row = (await instance.db.pool.query('SELECT * FROM ai_runs WHERE id=$1', [run.id])).rows[0];
  expect(row.enrolment_id).toBeNull();
  expect(row.scope).toBe('assessment_authoring');
  expect(row.task_input).not.toContain('Cedar');
  const job = await claim(instance.db, ['ai.task']);
  expect(job).toBeDefined();
  await gateway.process(job!);
  await finish(instance.db, job!, 'done');
  const ready = await service.get(session.token, client, run.id);
  expect(ready.status).toBe('complete');
  expect(ready.proposal.questions).toHaveLength(5);
  expect((await definitions.list(session.token, client)).total).toBe(0);
});
it('cancels queued work durably and never delivers it', async () => {
  const run = await service.request(session.token, session.csrf, client, randomUUID(), {
    topic: 'Cedar workshop safety',
  });
  expect(typeof service.cancel).toBe('function');
  await service.cancel(session.token, session.csrf, client, run.id);
  const job = await claim(instance.db, ['ai.task']);
  if (job) {
    await gateway.process(job);
    await finish(instance.db, job, 'done');
  }
  expect(await service.get(session.token, client, run.id)).toMatchObject({
    status: 'cancelled',
    proposal: null,
  });
});
it('serializes concurrent admission and enforces the inherited tenant RLS boundary', async () => {
  const requests = await Promise.allSettled(
    [1, 2].map(() =>
      service.request(session.token, session.csrf, client, randomUUID(), {
        topic: 'Cedar workshop safety',
      }),
    ),
  );
  expect(requests.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const run = (requests.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>).value;
  const actor = (await definitions.auth.context(session.token)).user!;
  const rows = await instance.db.scoped(
    { organisationId: client, environment: 'test', actorId: actor.id },
    (sql) => sql.query('SELECT id FROM ai_runs WHERE id=$1', [run.id]),
  );
  expect(rows.rowCount).toBe(1);
  const other = (
    await instance.db.pool.query('SELECT id FROM organisations WHERE id<>$1 LIMIT 1', [client])
  ).rows[0].id;
  const hidden = await instance.db.scoped(
    { organisationId: other, environment: 'test', actorId: actor.id },
    (sql) => sql.query('SELECT id FROM ai_runs WHERE id=$1', [run.id]),
  );
  expect(hidden.rowCount).toBe(0);
  await expect(
    instance.db.pool.query("UPDATE ai_runs SET scope='enrolment' WHERE id=$1", [run.id]),
  ).rejects.toBeDefined();
  await service.cancel(session.token, session.csrf, client, run.id);
});
it('enforces distinct authoring and organisation monetary caps', async () => {
  for (const limits of [
    { authoringLimit: 0, organisationLimit: 1000000 },
    { authoringLimit: 1000000, organisationLimit: 0 },
  ]) {
    const limited = new AiGateway(
      new AiRegistry(gateway.registry.enrolments, () => ({
        ...aiConfig(),
        ...limits,
        authoringCallLimit: 20,
      })),
      gateway.key,
    );
    const generation = new module.AssessmentTopicGeneration(definitions, limited);
    await expect(
      generation.request(session.token, session.csrf, client, randomUUID(), {
        topic: 'Cedar workshop safety',
      }),
    ).rejects.toMatchObject({ code: 'spend_limit' });
  }
});
it('never repairs or retries invalid output automatically', async () => {
  let calls = 0;
  gateway.providers.mock = async () => {
    calls++;
    return { text: '{}', inputTokens: 10, outputTokens: 10, externalId: 'invalid-fixture' };
  };
  const run = await service.request(session.token, session.csrf, client, randomUUID(), {
    topic: 'Cedar workshop safety',
  });
  let job;
  while ((job = await claim(instance.db, ['ai.task']))) {
    await gateway.process(job);
    await finish(instance.db, job, 'done');
  }
  expect(calls).toBe(1);
  expect(await service.get(session.token, client, run.id)).toMatchObject({
    status: 'failed',
    proposal: null,
  });
  gateway.providers.mock = mockProvider;
});
it('rejects authoring runs for nonexistent clients at the database boundary', async () => {
  const actor = (await definitions.auth.context(session.token)).user!;
  await expect(
    instance.db.pool.query(
      "INSERT INTO ai_runs(id,organisation_id,environment,enrolment_id,actor_id,idempotency_key,payload_hash,task,subject_id,status,configuration,task_input,reserved,scope) VALUES($1,$2,'test',NULL,$3,$4,'hash','generate_assessment_topic',$1,'failed','{}','cipher',0,'assessment_authoring')",
      [randomUUID(), randomUUID(), actor.id, randomUUID()],
    ),
  ).rejects.toBeDefined();
});
it('rechecks selected-client authority at dispatch and result reads', async () => {
  let calls = 0;
  gateway.providers.mock = async (...args) => {
    calls++;
    return mockProvider(...args);
  };
  const run = await service.request(session.token, session.csrf, client, randomUUID(), {
    topic: 'Cedar workshop safety',
  });
  const tenancy = new Tenancy(definitions.auth);
  const actor = (await definitions.auth.context(session.token)).user!;
  await instance.db.pool.query('UPDATE sessions SET organisation_id=NULL WHERE user_id=$1', [
    actor.id,
  ]);
  await expect(service.get(session.token, client, run.id)).rejects.toMatchObject({ status: 403 });
  const job = await claim(instance.db, ['ai.task']);
  await gateway.process(job!);
  await finish(instance.db, job!, 'done');
  expect(calls).toBe(0);
  await tenancy.select(session.token, session.csrf, client);
  expect(await service.get(session.token, client, run.id)).toMatchObject({
    status: 'failed',
    proposal: null,
  });
  gateway.providers.mock = mockProvider;
});
it('retains ambiguous reservations and blocks any new authoring request', async () => {
  gateway.providers.mock = async () => {
    throw new ProviderFailure('ambiguous');
  };
  const run = await service.request(session.token, session.csrf, client, randomUUID(), {
    topic: 'Cedar workshop safety',
  });
  const job = await claim(instance.db, ['ai.task']);
  await gateway.process(job!);
  await finish(instance.db, job!, 'done');
  expect(await service.get(session.token, client, run.id)).toMatchObject({
    status: 'ambiguous',
    proposal: null,
  });
  expect(
    Number(
      (await instance.db.pool.query('SELECT reserved FROM ai_runs WHERE id=$1', [run.id])).rows[0]
        .reserved,
    ),
  ).toBeGreaterThan(0);
  await expect(
    service.request(session.token, session.csrf, client, randomUUID(), {
      topic: 'Cedar workshop safety',
    }),
  ).rejects.toMatchObject({ code: 'authoring_active' });
  gateway.providers.mock = mockProvider;
});
