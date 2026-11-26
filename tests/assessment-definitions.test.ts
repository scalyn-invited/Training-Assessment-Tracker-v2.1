import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { testDatabase } from './helpers.js';
import { Auth } from '../packages/domain/src/auth.js';
import { Tenancy } from '../packages/domain/src/tenancy.js';
import { AssessmentDefinitions } from '../packages/domain/src/assessment-definitions.js';
const input = () => ({
  title: 'Pinned safety assessment',
  questions: [
    {
      id: 'q',
      type: 'multiple_choice',
      prompt: 'Choose',
      choices: [
        { id: 'safe', text: 'Check' },
        { id: 'unsafe', text: 'Ignore' },
      ],
    },
  ],
  answer_key: { q: 'safe' },
  rubric: { threshold: 75, criteria: [] },
});
describe('assessment definitions and publication', () => {
  let instance: Awaited<ReturnType<typeof testDatabase>>,
    auth: Auth,
    tenancy: Tenancy,
    definitions: AssessmentDefinitions,
    admin: { token: string; csrf: string },
    coordinator: { token: string; csrf: string },
    member: { token: string; csrf: string },
    client: string,
    other: string;
  async function login(email: string, password = 'Separate demonstration password') {
    const g = await auth.context();
    return auth.login(g.token!, g.csrf, email, password);
  }
  beforeAll(async () => {
    instance = await testDatabase();
    const key = randomBytes(32);
    auth = new Auth(instance.db, key);
    tenancy = new Tenancy(auth);
    definitions = new AssessmentDefinitions(auth, key);
    const g = await auth.context();
    await auth.setup(g.token!, g.csrf, {
      name: 'Admin',
      email: 'admin@example.invalid',
      password: 'Unique administrator passphrase',
      demoPassword: 'Separate demonstration password',
    });
    admin = await login('admin@example.invalid', 'Unique administrator passphrase');
    coordinator = await login('demo.1.2@example.invalid');
    member = await login('demo.1.3@example.invalid');
    const clients = await tenancy.choices(admin.token);
    client = clients[0].id;
    other = clients[1].id;
    for (const session of [admin, coordinator, member])
      await tenancy.select(session.token, session.csrf, client);
  });
  afterAll(async () => {
    await instance?.close();
  });
  it('validates proposals only for the selected-client author without writing definitions', async () => {
    const source = JSON.stringify({
      format: 'assessment-proposals-v1',
      questions: [
        {
          reference: 'q',
          type: 'open_response',
          prompt: 'Explain.',
          choices: [],
          suggested_answer: 'Private preview only.',
        },
      ],
      rubric: null,
    });
    const before = await definitions.list(coordinator.token, client);
    expect(
      (await definitions.validateProposals(coordinator.token, coordinator.csrf, client, source))
        .questions,
    ).toHaveLength(1);
    expect(await definitions.list(coordinator.token, client)).toEqual(before);
    for (const session of [admin, member])
      await expect(
        definitions.validateProposals(session.token, session.csrf, client, source),
      ).rejects.toMatchObject({ status: 403 });
    await expect(
      definitions.validateProposals(coordinator.token, coordinator.csrf, other, source),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      definitions.validateProposals(coordinator.token, 'invalid', client, source),
    ).rejects.toBeDefined();
    for (const invalid of ['{', 'x'.repeat(262145), source.replace('Explain.', '<b>Explain.</b>')])
      await expect(
        definitions.validateProposals(coordinator.token, coordinator.csrf, client, invalid),
      ).rejects.toMatchObject({ status: 422 });
  });
  it('requires coordinator membership rather than platform authority', async () => {
    await expect(definitions.list(admin.token, client)).rejects.toMatchObject({ status: 403 });
    await expect(definitions.list(member.token, client)).rejects.toMatchObject({ status: 403 });
    await expect(definitions.list(coordinator.token, other)).rejects.toMatchObject({ status: 403 });
  });
  it('encrypts keys, replays identical saves and rejects changed tokens or stale versions', async () => {
    const token = randomUUID(),
      data = input();
    const saved = await definitions.save(
      coordinator.token,
      coordinator.csrf,
      client,
      data,
      null,
      0,
      token,
    );
    expect(
      await definitions.save(coordinator.token, coordinator.csrf, client, data, null, 0, token),
    ).toEqual(saved);
    await expect(
      definitions.save(
        coordinator.token,
        coordinator.csrf,
        client,
        { ...data, title: 'Changed' },
        null,
        0,
        token,
      ),
    ).rejects.toMatchObject({ status: 409 });
    const row = (
      await instance.db.pool.query('SELECT answer_key FROM assessment_definitions WHERE id=$1', [
        saved.id,
      ])
    ).rows[0];
    expect(row.answer_key).not.toContain('safe');
    expect((await definitions.get(coordinator.token, client, saved.id)).answer_key).toEqual({
      q: 'safe',
    });
    expect((await definitions.list(coordinator.token, client)).definitions[0]).not.toHaveProperty(
      'answer_key',
    );
    await expect(
      definitions.save(
        coordinator.token,
        coordinator.csrf,
        client,
        data,
        saved.id,
        0,
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('publishes immutable revisions and edits by creating a new family revision', async () => {
    const first = await definitions.save(
      coordinator.token,
      coordinator.csrf,
      client,
      input(),
      null,
      0,
      randomUUID(),
    );
    await definitions.publish(coordinator.token, coordinator.csrf, client, first.id, first.version);
    await expect(
      instance.db.pool.query("UPDATE assessment_definitions SET title='Forbidden' WHERE id=$1", [
        first.id,
      ]),
    ).rejects.toThrow('immutable');
    const copyToken = randomUUID();
    const second = await definitions.save(
      coordinator.token,
      coordinator.csrf,
      client,
      { ...input(), title: 'Revised' },
      first.id,
      2,
      copyToken,
    );
    expect(
      await definitions.save(
        coordinator.token,
        coordinator.csrf,
        client,
        { ...input(), title: 'Revised' },
        first.id,
        2,
        copyToken,
      ),
    ).toEqual(second);
    expect(second.id).not.toBe(first.id);
    const a = await definitions.get(coordinator.token, client, first.id),
      b = await definitions.get(coordinator.token, client, second.id);
    expect(a.title).toBe('Pinned safety assessment');
    expect(b.family_id).toBe(a.family_id);
    expect(b.revision).toBe(a.revision + 1);
    expect(b.status).toBe('draft');
    expect(b).toMatchObject({ source_definition_id: a.id, source_revision: a.revision });
    expect(second).toMatchObject({
      revision: b.revision,
      source_definition_id: a.id,
      source_revision: a.revision,
    });
    await expect(definitions.get(member.token, client, second.id)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      instance.db.pool.query(
        'UPDATE assessment_definitions SET source_definition_id=NULL,source_revision=NULL WHERE id=$1',
        [second.id],
      ),
    ).rejects.toThrow();
  });
  it('QA D03 exact publication retry conflicts but exact readback confirms the same published record', async () => {
    const saved = await definitions.save(
      coordinator.token,
      coordinator.csrf,
      client,
      input(),
      null,
      0,
      randomUUID(),
    );
    await definitions.publish(coordinator.token, coordinator.csrf, client, saved.id, saved.version);
    await expect(
      definitions.publish(coordinator.token, coordinator.csrf, client, saved.id, saved.version),
    ).rejects.toMatchObject({ status: 409 });
    expect(await definitions.get(coordinator.token, client, saved.id)).toMatchObject({
      id: saved.id,
      status: 'published',
      revision: 1,
      version: 2,
    });
  });
  it('blocks incomplete publication and foreign or quarantined image references', async () => {
    const incomplete = await definitions.save(
      coordinator.token,
      coordinator.csrf,
      client,
      { title: '', questions: [], rubric: { threshold: null, criteria: [] } },
      null,
      0,
      randomUUID(),
    );
    await expect(
      definitions.publish(coordinator.token, coordinator.csrf, client, incomplete.id, 1),
    ).rejects.toMatchObject({ code: 'assessment_not_ready' });
    const image = randomUUID(),
      data = input();
    const content = {
      ...data,
      questions: [
        {
          ...data.questions[0],
          prompt_html: '<p>Choose<img src="/assessments/media/' + image + '"></p>',
        },
      ],
    };
    await expect(
      definitions.save(coordinator.token, coordinator.csrf, client, content, null, 0, randomUUID()),
    ).rejects.toMatchObject({ code: 'foreign_media' });
    const actor = (await auth.context(coordinator.token)).user!.id;
    await instance.db.pool.query(
      "INSERT INTO assessment_media(id,organisation_id,environment,actor_id,path,source_hash,status) VALUES($1,$2,'test',$3,'synthetic-not-a-file','synthetic-hash','quarantined')",
      [image, client, actor],
    );
    const draft = await definitions.save(
      coordinator.token,
      coordinator.csrf,
      client,
      content,
      null,
      0,
      randomUUID(),
    );
    await expect(
      definitions.publish(coordinator.token, coordinator.csrf, client, draft.id, 1),
    ).rejects.toMatchObject({ code: 'media_not_ready' });
  });
});
