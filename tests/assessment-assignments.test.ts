import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { testDatabase } from './helpers.js';
import { Auth } from '../packages/domain/src/auth.js';
import { Tenancy } from '../packages/domain/src/tenancy.js';
import { Enrolments } from '../packages/domain/src/enrolments.js';
import { AssessmentDefinitions } from '../packages/domain/src/assessment-definitions.js';
import { AssessmentAssignments } from '../packages/domain/src/assessment-assignments.js';
let instance: Awaited<ReturnType<typeof testDatabase>>,
  auth: Auth,
  tenancy: Tenancy,
  enrolments: Enrolments,
  definitions: AssessmentDefinitions,
  assignments: AssessmentAssignments;
let admin: { token: string; csrf: string },
  coordinator: { token: string; csrf: string },
  member: { token: string; csrf: string };
let client: string,
  other: string,
  memberId: string,
  reviewerId: string,
  team: string,
  record: string,
  definition: string,
  rule: string,
  media: string,
  coordinatorUser: string;
const reason = 'Create synthetic assignment fixture';
async function enrol(title = 'Assignment practice') {
  return enrolments.create(admin.token, admin.csrf, client, {
    memberId,
    coordinatorId: reviewerId,
    groupId: team,
    title,
    reason,
  });
}
beforeAll(async () => {
  instance = await testDatabase();
  const key = randomBytes(32);
  auth = new Auth(instance.db, key);
  tenancy = new Tenancy(auth);
  enrolments = new Enrolments(auth);
  definitions = new AssessmentDefinitions(auth, key);
  assignments = new AssessmentAssignments(definitions);
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
  const clients = await tenancy.choices(admin.token);
  client = clients[0].id;
  other = clients[1].id;
  for (const s of [admin, coordinator, member]) await tenancy.select(s.token, s.csrf, client);
  const rows = (
    await instance.db.pool.query(
      'SELECT cm.id,u.id user_id,u.email FROM client_memberships cm JOIN users u ON u.id=cm.user_id WHERE cm.organisation_id=$1',
      [client],
    )
  ).rows;
  memberId = rows.find((r) => r.email === 'demo.1.3@example.invalid').id;
  reviewerId = rows.find((r) => r.email === 'demo.1.2@example.invalid').id;
  coordinatorUser = rows.find((r) => r.email === 'demo.1.2@example.invalid').user_id;
  team = (await instance.db.pool.query('SELECT id FROM groups WHERE organisation_id=$1', [client]))
    .rows[0].id;
  record = (await enrol()).id;
  media = randomUUID();
  await instance.db.pool.query(
    "INSERT INTO assessment_media(id,organisation_id,environment,actor_id,path,source_hash,status) VALUES($1,$2,'test',$3,'fixture','fixture','ready')",
    [media, client, coordinatorUser],
  );
  definition = (
    await definitions.save(
      coordinator.token,
      coordinator.csrf,
      client,
      {
        title: 'Assignment assessment',
        questions: [
          {
            id: 'q',
            type: 'multiple_choice',
            prompt: 'Choose',
            prompt_html:
              '<p>Choose</p><img src="/assessments/media/' + media + '" alt="Test image">',
            choices: [
              { id: 'yes', text: 'Safe' },
              { id: 'no', text: 'Unsafe' },
            ],
          },
        ],
        answer_key: { q: 'yes' },
        rubric: { threshold: 75, criteria: [] },
      },
      null,
      0,
      randomUUID(),
    )
  ).id;
});
afterAll(async () => {
  await instance?.close();
});
it('rejects unpublished revisions and missing independent sensitive authority', async () => {
  await expect(
    assignments.create(coordinator.token, coordinator.csrf, client, definition, 'member', record),
  ).rejects.toMatchObject({ status: 422 });
  await definitions.publish(coordinator.token, coordinator.csrf, client, definition, 1);
  await expect(
    assignments.create(coordinator.token, coordinator.csrf, client, definition, 'member', record),
  ).rejects.toMatchObject({ status: 404 });
  expect((await assignments.choices(coordinator.token, client, definition)).members).toEqual([]);
  await expect(
    assignments.create(admin.token, admin.csrf, client, definition, 'member', record),
  ).rejects.toMatchObject({ status: 403 });
  const allocation = (
    await instance.db.pool.query(
      "SELECT id FROM coordinator_allocations WHERE member_membership_id=$1 AND kind='primary' AND ends_at IS NULL",
      [memberId],
    )
  ).rows[0].id;
  const actor = (await auth.context(admin.token)).user!;
  await instance.db.pool.query(
    "INSERT INTO client_sensitive_grants(id,organisation_id,environment,allocation_id,granted_by,reason) VALUES($1,$2,'test',$3,$4,$5)",
    [randomUUID(), client, allocation, actor.id, reason],
  );
});
it('assigns one pinned revision idempotently and exposes only scoped assignment metadata', async () => {
  const first = await assignments.create(
    coordinator.token,
    coordinator.csrf,
    client,
    definition,
    'member',
    record,
  );
  expect(
    await assignments.create(
      coordinator.token,
      coordinator.csrf,
      client,
      definition,
      'member',
      record,
    ),
  ).toEqual(first);
  const own = await assignments.list(member.token, client);
  expect(own).toMatchObject({ author: false, total: 1 });
  expect(own.assignments[0].id).toBe(first.id);
  expect(JSON.stringify(own)).not.toContain('answer_key');
  expect((await assignments.list(admin.token, client)).total).toBe(0);
  await expect(assignments.list(coordinator.token, other)).rejects.toMatchObject({ status: 403 });
  const actor = (await auth.context(member.token)).user!;
  expect(
    await instance.db.transaction((sql) => assignments.canReadMedia(sql, actor, client, media)),
  ).toBe(true);
  expect(
    await instance.db.transaction((sql) =>
      assignments.canReadMedia(sql, actor, client, randomUUID()),
    ),
  ).toBe(false);
  expect((await assignments.list(member.token, client, 99)).total).toBe(1);
  expect((await assignments.list(member.token, client, 99)).assignments).toEqual([]);
});
it('pins team rules, includes future eligible records and does not replace individual assignments', async () => {
  rule = (
    await assignments.create(coordinator.token, coordinator.csrf, client, definition, 'team', team)
  ).id;
  expect((await assignments.choices(coordinator.token, client, definition)).rules[0]).toMatchObject(
    { id: rule, active: true },
  );
  expect(
    (
      await instance.db.pool.query(
        'SELECT team_rule_id FROM assessment_assignments WHERE enrolment_id=$1',
        [record],
      )
    ).rows[0].team_rule_id,
  ).toBeNull();
  const later = await enrol('Later programme');
  await assignments.recover();
  expect(
    (
      await instance.db.pool.query(
        'SELECT definition_id,team_rule_id FROM assessment_assignments WHERE enrolment_id=$1',
        [later.id],
      )
    ).rows[0],
  ).toMatchObject({ definition_id: definition, team_rule_id: rule });
  await assignments.recover();
  expect(
    (await instance.db.pool.query('SELECT count(*)::int total FROM assessment_assignments')).rows[0]
      .total,
  ).toBe(2);
});
it('stops future assignments without deleting work and resumes only explicitly', async () => {
  await assignments.change(coordinator.token, coordinator.csrf, client, rule, 1, 'stop');
  const later = await enrol('Stopped-rule programme');
  await assignments.recover();
  expect(
    (
      await instance.db.pool.query('SELECT id FROM assessment_assignments WHERE enrolment_id=$1', [
        later.id,
      ])
    ).rowCount,
  ).toBe(0);
  await expect(
    assignments.create(coordinator.token, coordinator.csrf, client, definition, 'team', team),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    assignments.change(coordinator.token, coordinator.csrf, client, rule, 1, 'resume'),
  ).rejects.toMatchObject({ status: 409 });
  await assignments.change(coordinator.token, coordinator.csrf, client, rule, 2, 'resume');
  expect(
    (
      await instance.db.pool.query('SELECT id FROM assessment_assignments WHERE enrolment_id=$1', [
        later.id,
      ])
    ).rowCount,
  ).toBe(1);
});
it('blocks future processing when the rule creator loses current authority', async () => {
  const later = await enrol('Revoked-rule programme');
  await instance.db.pool.query(
    "UPDATE role_assignments SET ends_at=now() WHERE user_id=$1 AND organisation_id=$2 AND role='coordinator'",
    [coordinatorUser, client],
  );
  await assignments.recover();
  expect(
    (
      await instance.db.pool.query('SELECT id FROM assessment_assignments WHERE enrolment_id=$1', [
        later.id,
      ])
    ).rowCount,
  ).toBe(0);
  expect(
    (await instance.db.pool.query('SELECT result FROM assessment_team_rules WHERE id=$1', [rule]))
      .rows[0].result,
  ).toContain('Blocked:');
  expect((await assignments.list(member.token, client)).total).toBe(3);
  expect((await assignments.list(coordinator.token, client)).total).toBe(0);
});
