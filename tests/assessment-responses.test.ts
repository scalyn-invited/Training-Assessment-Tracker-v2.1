import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { testDatabase } from './helpers.js';
import { Auth } from '../packages/domain/src/auth.js';
import { Tenancy } from '../packages/domain/src/tenancy.js';
import { Enrolments } from '../packages/domain/src/enrolments.js';
import { AssessmentDefinitions } from '../packages/domain/src/assessment-definitions.js';
import { AssessmentAssignments } from '../packages/domain/src/assessment-assignments.js';
import { AssessmentResponses } from '../packages/domain/src/assessment-responses.js';
import { decrypt } from '../packages/domain/src/crypto.js';
let instance: Awaited<ReturnType<typeof testDatabase>>,
  auth: Auth,
  tenancy: Tenancy,
  enrolments: Enrolments,
  definitions: AssessmentDefinitions,
  assignments: AssessmentAssignments,
  responses: AssessmentResponses;
let admin: { token: string; csrf: string },
  coordinator: { token: string; csrf: string },
  member: { token: string; csrf: string },
  otherMember: { token: string; csrf: string };
let client: string,
  memberId: string,
  reviewerId: string,
  team: string,
  definition: string,
  memberUser: string;
const sections = [randomUUID(), randomUUID(), randomUUID()],
  area = randomUUID(),
  rating = randomUUID();
async function assigned() {
  const enrolment = await enrolments.create(admin.token, admin.csrf, client, {
    memberId,
    coordinatorId: reviewerId,
    groupId: team,
    title: 'Response practice',
    reason: 'Synthetic response verification',
  });
  return {
    enrolment: enrolment.id,
    id: (
      await assignments.create(
        coordinator.token,
        coordinator.csrf,
        client,
        definition,
        'member',
        enrolment.id,
      )
    ).id,
  };
}
beforeAll(async () => {
  instance = await testDatabase();
  const key = randomBytes(32);
  auth = new Auth(instance.db, key);
  tenancy = new Tenancy(auth);
  enrolments = new Enrolments(auth);
  definitions = new AssessmentDefinitions(auth, key);
  assignments = new AssessmentAssignments(definitions);
  responses = new AssessmentResponses(assignments);
  const g = await auth.context();
  await auth.setup(g.token!, g.csrf, {
    name: 'Admin',
    email: 'admin@example.invalid',
    password: 'Unique administrator passphrase',
    demoPassword: 'Separate demonstration password',
  });
  async function login(email: string, password = 'Separate demonstration password') {
    const guest = await auth.context();
    return auth.login(guest.token!, guest.csrf, email, password);
  }
  admin = await login('admin@example.invalid', 'Unique administrator passphrase');
  coordinator = await login('demo.1.2@example.invalid');
  member = await login('demo.1.3@example.invalid');
  otherMember = await login('demo.1.4@example.invalid');
  client = (await tenancy.choices(admin.token))[0].id;
  for (const s of [admin, coordinator, member, otherMember])
    await tenancy.select(s.token, s.csrf, client);
  const rows = (
    await instance.db.pool.query(
      'SELECT cm.id,u.id user_id,u.email FROM client_memberships cm JOIN users u ON u.id=cm.user_id WHERE cm.organisation_id=$1',
      [client],
    )
  ).rows;
  memberId = rows.find((r) => r.email === 'demo.1.3@example.invalid').id;
  memberUser = rows.find((r) => r.email === 'demo.1.3@example.invalid').user_id;
  reviewerId = rows.find((r) => r.email === 'demo.1.2@example.invalid').id;
  team = (await instance.db.pool.query('SELECT id FROM groups WHERE organisation_id=$1', [client]))
    .rows[0].id;
  const allocation = (
      await instance.db.pool.query(
        "SELECT id FROM coordinator_allocations WHERE member_membership_id=$1 AND kind='primary' AND ends_at IS NULL",
        [memberId],
      )
    ).rows[0].id,
    actor = (await auth.context(admin.token)).user!;
  await instance.db.pool.query(
    "INSERT INTO client_sensitive_grants(id,organisation_id,environment,allocation_id,granted_by,reason) VALUES($1,$2,'test',$3,$4,'Independent test grant')",
    [randomUUID(), client, allocation, actor.id],
  );
  definition = (
    await definitions.save(
      coordinator.token,
      coordinator.csrf,
      client,
      {
        title: 'Section response',
        questions: [
          {
            id: 'matrix',
            type: 'self_assessment',
            prompt: 'Rate your practice',
            matrix: {
              areas: [{ id: area, text: 'I verify evidence' }],
              ratings: [
                { id: rating, text: 'Confident' },
                { id: randomUUID(), text: 'Need support' },
              ],
              required: true,
              notes_enabled: true,
            },
          },
          {
            id: 'choice',
            type: 'multiple_choice',
            prompt: 'Choose safely',
            choices: [
              { id: 'safe', text: 'Check evidence' },
              { id: 'unsafe', text: 'Skip checks' },
            ],
          },
          { id: 'written', type: 'open_response', prompt: 'Explain your process' },
        ],
        sections: sections.map((id, i) => ({
          id,
          title: 'Section ' + (i + 1),
          instructions: 'Complete this section',
          question_ids: [['matrix', 'choice', 'written'][i]],
        })),
        answer_key: { choice: 'safe' },
        rubric: {
          threshold: 75,
          criteria: [
            {
              id: 'evidence',
              category: 'Practice',
              label: 'Evidence',
              guidance: 'Use evidence',
              weight: 1,
            },
          ],
        },
      },
      null,
      0,
      randomUUID(),
    )
  ).id;
  await definitions.publish(coordinator.token, coordinator.csrf, client, definition, 1);
});
afterAll(async () => {
  await instance?.close();
});
function save(id: string, version: number, input: unknown, actor = member) {
  return responses.save(actor.token, actor.csrf, client, id, version, input);
}
it('limits editing to the member and never projects keys or rubric to the member', async () => {
  const a = await assigned();
  for (const s of [admin, otherMember])
    await expect(responses.read(s.token, client, a.id)).rejects.toMatchObject({ status: 404 });
  await expect(save(a.id, 1, { responses: {} }, coordinator)).rejects.toMatchObject({
    status: 403,
  });
  const view = await responses.read(member.token, client, a.id);
  expect(view).toMatchObject({ member: true, canReview: false, version: 1, status: 'assigned' });
  expect(JSON.stringify(view)).not.toContain('answer_key');
  expect(view.definition).not.toHaveProperty('rubric');
  expect((await responses.read(coordinator.token, client, a.id)).draft).toBeNull();
});
it('enforces section order and required matrix gates while retaining encrypted draft progress', async () => {
  const a = await assigned();
  await expect(save(a.id, 1, { responses: {} })).rejects.toMatchObject({ status: 422 });
  await expect(
    save(a.id, 1, {
      responses: {},
      section_id: sections[0],
      navigate_to: sections[2],
      save_token: randomUUID(),
    }),
  ).rejects.toMatchObject({ status: 422 });
  await expect(
    save(a.id, 1, {
      responses: { written: 'Wrong section' },
      section_id: sections[0],
      save_token: randomUUID(),
    }),
  ).rejects.toMatchObject({ status: 422 });
  await expect(
    save(a.id, 1, {
      responses: { matrix: {} },
      section_id: sections[0],
      navigate_to: sections[1],
      save_token: randomUUID(),
    }),
  ).rejects.toMatchObject({
    status: 422,
    errors: { ['responses.matrix.' + area + '.rating_id']: expect.any(String) },
  });
  const payload = {
    responses: { matrix: { [area]: { rating_id: rating, note: 'Private reflection' } } },
    section_id: sections[0],
    navigate_to: sections[1],
    context: 'Private context',
    save_token: randomUUID(),
  };
  const first = await save(a.id, 1, payload);
  expect(first.progress).toEqual({ current: sections[1], furthest: sections[1] });
  expect(await save(a.id, 1, payload)).toEqual(first);
  await expect(save(a.id, 1, { ...payload, context: 'Changed' })).rejects.toMatchObject({
    status: 409,
  });
  const stored = (
    await instance.db.pool.query('SELECT draft FROM assessment_assignments WHERE id=$1', [a.id])
  ).rows[0].draft;
  expect(stored).not.toContain('Private reflection');
  const restored = await responses.read(member.token, client, a.id);
  expect(restored.draft?.context).toBe('Private context');
  expect(restored.draft?.progress?.current).toBe(sections[1]);
  await expect(
    responses.submit(member.token, member.csrf, client, a.id, 2, randomUUID()),
  ).rejects.toMatchObject({ status: 422 });
  await expect(
    save(a.id, 2, {
      responses: { choice: 'invented' },
      section_id: sections[1],
      save_token: randomUUID(),
    }),
  ).rejects.toMatchObject({ status: 422 });
  await save(a.id, 2, {
    responses: { choice: 'safe' },
    section_id: sections[1],
    navigate_to: sections[2],
    save_token: randomUUID(),
  });
  await save(a.id, 3, {
    responses: { written: 'I check each evidence source.' },
    section_id: sections[2],
    save_token: randomUUID(),
  });
  const key = randomUUID(),
    submitted = await responses.submit(member.token, member.csrf, client, a.id, 4, key);
  expect(await responses.submit(member.token, member.csrf, client, a.id, 4, key)).toEqual(
    submitted,
  );
  await expect(
    responses.submit(member.token, member.csrf, client, a.id, 3, key),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    save(a.id, 5, {
      responses: { written: 'Overwrite' },
      section_id: sections[2],
      save_token: randomUUID(),
    }),
  ).rejects.toMatchObject({ status: 409 });
  const attempt = (
    await instance.db.pool.query('SELECT * FROM assessment_attempts WHERE id=$1', [
      submitted.receipt,
    ])
  ).rows[0];
  expect(attempt.snapshot).not.toContain('I check each evidence source');
  const snapshot = JSON.parse(decrypt(attempt.snapshot, definitions.key));
  expect(snapshot.answer_key).toEqual({ choice: 'safe' });
  expect(snapshot.rubric.criteria[0].weight).toBe(1);
  expect(snapshot.responses.choice).toBe('safe');
  expect(snapshot.responses.matrix[area].note).toBe('Private reflection');
  const history = await responses.read(member.token, client, a.id);
  expect(history.attempts[0]).not.toHaveProperty('answer_key');
  expect(history.attempts[0]).not.toHaveProperty('rubric');
  expect(history.attempts[0].responses).toEqual(snapshot.responses);
  await expect(
    instance.db.pool.query("UPDATE assessment_attempts SET snapshot='changed' WHERE id=$1", [
      submitted.receipt,
    ]),
  ).rejects.toThrow('immutable');
  await expect(
    instance.db.pool.query('DELETE FROM assessment_attempts WHERE id=$1', [submitted.receipt]),
  ).rejects.toThrow('immutable');
});
it('accepts only accessible clean evidence from the same enrolment', async () => {
  const a = await assigned(),
    own = randomUUID(),
    privateFile = randomUUID();
  await instance.db.pool.query(
    "INSERT INTO evidence_files(id,organisation_id,environment,enrolment_id,uploaded_by,storage_key,original_name,mime,bytes,sha256,purpose,scan_status) VALUES($1,$2,'test',$3,$4,$5,'own.txt','text/plain',5,'hash','evidence','quarantined'),($6,$2,'test',$3,$4,$7,'assessment.txt','text/plain',5,'hash','assessment','clean')",
    [own, client, a.enrolment, memberUser, randomUUID(), privateFile, randomUUID()],
  );
  const body = { responses: {}, section_id: sections[0], save_token: randomUUID(), files: [own] };
  await expect(save(a.id, 1, body)).rejects.toMatchObject({ status: 422 });
  await expect(save(a.id, 1, { ...body, files: [privateFile] })).rejects.toMatchObject({
    status: 422,
  });
  await instance.db.pool.query("UPDATE evidence_files SET scan_status='clean' WHERE id=$1", [own]);
  await save(a.id, 1, body);
  expect((await responses.read(member.token, client, a.id)).draft?.files).toEqual([own]);
  const other = await assigned();
  await expect(save(other.id, 1, { ...body, save_token: randomUUID() })).rejects.toMatchObject({
    status: 422,
  });
});
it('does not permit other members to replay a submission reference', async () => {
  const a = await assigned();
  await expect(
    responses.submit(otherMember.token, otherMember.csrf, client, a.id, 1, randomUUID()),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    save(a.id, 1, {
      responses: { matrix: { [area]: { rating_id: randomUUID() } } },
      section_id: sections[0],
      save_token: randomUUID(),
    }),
  ).rejects.toMatchObject({ status: 422 });
});

it('preserves unsectioned multiple-choice responses and allows an unanswered choice', async () => {
  const definitionId = (
    await definitions.save(
      coordinator.token,
      coordinator.csrf,
      client,
      {
        title: 'Legacy flat assessment',
        questions: [
          {
            id: 'choice',
            type: 'multiple_choice',
            prompt: 'Choose',
            choices: [
              { id: 'yes', text: 'Yes' },
              { id: 'no', text: 'No' },
            ],
          },
        ],
        answer_key: { choice: 'yes' },
        rubric: { threshold: null, criteria: [] },
      },
      null,
      0,
      randomUUID(),
    )
  ).id;
  await definitions.publish(coordinator.token, coordinator.csrf, client, definitionId, 1);
  const e = await enrolments.create(admin.token, admin.csrf, client, {
    memberId,
    coordinatorId: reviewerId,
    groupId: team,
    title: 'Flat response',
    reason: 'Preserve existing flat assessments',
  });
  const a = await assignments.create(
    coordinator.token,
    coordinator.csrf,
    client,
    definitionId,
    'member',
    e.id,
  );
  await save(a.id, 1, { responses: { choice: '' }, context: 'No answer selected' });
  const result = await responses.submit(member.token, member.csrf, client, a.id, 2, randomUUID());
  expect(result.status).toBe('submitted');
  const view = await responses.read(member.token, client, a.id);
  expect(view.definition.sections).toBeNull();
  expect(view.attempts[0].responses.choice).toBe('');
});
