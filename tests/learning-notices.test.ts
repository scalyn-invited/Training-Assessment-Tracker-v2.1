import { LearningNotices } from '../packages/domain/src/learning-notices.js';
import { recordNotice } from '../packages/domain/src/notification-records.js';
import {
  mailOutcome,
  SmtpNoticeMail,
  type NoticeMessage,
} from '../packages/domain/src/notification-mail.js';
import { claim, finish } from '../packages/domain/src/outbox.js';
import { LearningKpis } from '../packages/domain/src/learning-kpis.js';
import { setTimeout as delay } from 'node:timers/promises';
import { LearningLifecycle } from '../packages/domain/src/learning-lifecycle.js';
import { LearningGrading } from '../packages/domain/src/learning-grading.js';
import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { testDatabase } from './helpers.js';
import { Auth } from '../packages/domain/src/auth.js';
import { Tenancy } from '../packages/domain/src/tenancy.js';
import { Enrolments, type Enrolment } from '../packages/domain/src/enrolments.js';
import { Onboarding } from '../packages/domain/src/onboarding.js';
import { LearningPlans } from '../packages/domain/src/learning-plans.js';
import { Delivery } from '../packages/domain/src/delivery.js';
import { digest, encrypt } from '../packages/domain/src/crypto.js';
import type { LearningBlock } from '../packages/domain/src/programme-content.js';
let instance: Awaited<ReturnType<typeof testDatabase>>,
  auth: Auth,
  tenancy: Tenancy,
  enrolments: Enrolments,
  onboarding: Onboarding;
let admin: { token: string; csrf: string },
  coordinator: { token: string; csrf: string },
  member: { token: string; csrf: string };
let team: string;
let client: string,
  other: string,
  record: string,
  memberId: string,
  reviewerId: string,
  allocation: string;
const reason = 'Confirm reviewed member availability';
const assessment = {
  source: 'Original interview',
  provider: 'Coordinator',
  date: '2026-01-01',
  scale: 'Not scored',
  findings: 'Observed safe practice',
  kind: 'observed evidence',
};
const schedule = {
  duration: 4,
  daily_minutes: 30,
  capacity_minutes: 60,
  start_date: '2027-01-11',
  timezone: 'Asia/Manila',
  weekdays: [1, 2, 3, 4, 5],
  holidays: [],
  absences: [],
};
beforeAll(async () => {
  instance = await testDatabase();
  auth = new Auth(instance.db, randomBytes(32));
  tenancy = new Tenancy(auth);
  enrolments = new Enrolments(auth);
  onboarding = new Onboarding(enrolments, randomBytes(32));
  const guest = await auth.context();
  await auth.setup(guest.token!, guest.csrf, {
    name: 'Admin',
    email: 'admin@example.invalid',
    password: 'Unique administrator passphrase',
    demoPassword: 'Separate demonstration password',
  });
  async function login(email: string, password = 'Separate demonstration password') {
    const g = await auth.context();
    return auth.login(g.token!, g.csrf, email, password);
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
      'SELECT cm.id,u.email FROM client_memberships cm JOIN users u ON u.id=cm.user_id WHERE cm.organisation_id=$1',
      [client],
    )
  ).rows;
  memberId = rows.find((r) => r.email === 'demo.1.3@example.invalid').id;
  reviewerId = rows.find((r) => r.email === 'demo.1.2@example.invalid').id;
  team = (await instance.db.pool.query('SELECT id FROM groups WHERE organisation_id=$1', [client]))
    .rows[0].id;
  record = (
    await enrolments.create(admin.token, admin.csrf, client, {
      memberId,
      coordinatorId: reviewerId,
      groupId: team,
      title: 'Calendar onboarding',
      reason,
    })
  ).id;
  allocation = (
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
afterAll(async () => {
  await instance?.close();
});

async function add(kind = 'programme_ready', id = record) {
  return instance.db.transaction(async (sql) => {
    const e = (await sql.query<Enrolment>('SELECT * FROM enrolments WHERE id=$1', [id])).rows[0];
    const event = randomUUID();
    await recordNotice(sql, e, e.member_id, event, kind);
    await recordNotice(sql, e, e.member_id, event, kind);
    return (await sql.query('SELECT * FROM learning_notifications WHERE event_key=$1', [event]))
      .rows[0];
  });
}
async function send(service: LearningNotices) {
  const job = await claim(instance.db, ['learning.notice']);
  expect(job).toBeTruthy();
  await service.process(job!);
  await finish(instance.db, job!, 'done');
  return job!;
}
async function notice(id: string) {
  return (await instance.db.pool.query('SELECT * FROM learning_notifications WHERE id=$1', [id]))
    .rows[0];
}
it('deduplicates dispatch, uses the test sink and preserves in-app updates without email', async () => {
  const n = await add(),
    service = new LearningNotices(enrolments, {
      configured: () => true,
      send: async () => {
        throw new Error('Test mail must never reach transport');
      },
    });
  expect(
    (
      await instance.db.pool.query("SELECT id FROM outbox_events WHERE payload->>'noticeId'=$1", [
        n.id,
      ])
    ).rowCount,
  ).toBe(1);
  await send(service);
  expect((await notice(n.id)).status).toBe('sink_delivered');
  expect((await notice(n.id)).attempts).toBe(1);
  await service.preference(member.token, member.csrf, false);
  const quiet = await add();
  await send(service);
  expect((await notice(quiet.id)).status).toBe('in_app_only');
  const view = await service.read(member.token, client);
  expect(view.trainingEmail).toBe(false);
  expect(view.total).toBe(2);
  expect(view.notices[0]).not.toHaveProperty('recipient_id');
  expect((await service.read(coordinator.token, client)).total).toBe(0);
  await service.preference(member.token, member.csrf, true);
});
it('rechecks revoked recipient authority before dispatch and before list pagination', async () => {
  const service = new LearningNotices(enrolments),
    n = await add();
  const uid = (await auth.context(member.token)).user!.id;
  await instance.db.pool.query(
    "UPDATE role_assignments SET ends_at=now() WHERE user_id=$1 AND role='member'",
    [uid],
  );
  await send(service);
  expect((await notice(n.id)).status).toBe('cancelled');
  expect((await service.read(member.token, client)).total).toBe(0);
  await instance.db.pool.query(
    "UPDATE role_assignments SET ends_at=NULL WHERE user_id=$1 AND role='member'",
    [uid],
  );
});
it('recovers missed dispatch but holds interrupted sending without replay', async () => {
  const service = new LearningNotices(enrolments),
    n = await add();
  await instance.db.pool.query(
    "UPDATE outbox_events SET status='failed' WHERE kind='learning.notice' AND payload->>'noticeId'=$1",
    [n.id],
  );
  await service.recover();
  await service.recover();
  expect((await notice(n.id)).dispatch_version).toBe(2);
  await send(service);
  const interrupted = await add();
  const job = await claim(instance.db, ['learning.notice']);
  await instance.db.pool.query(
    "UPDATE learning_notifications SET status='sending',started_at=now()-interval '4 minutes',attempts=1 WHERE id=$1",
    [interrupted.id],
  );
  await instance.db.pool.query(
    "UPDATE outbox_events SET lease_until=now()-interval '1 second' WHERE id=$1",
    [job!.id],
  );
  await service.recover();
  expect((await notice(interrupted.id)).status).toBe('ambiguous');
  expect(await claim(instance.db, ['learning.notice'])).toBeUndefined();
});
let productionRecord: string;
async function production() {
  if (productionRecord) return productionRecord;
  const org = randomUUID(),
    uid = randomUUID(),
    coordinatorId = randomUUID(),
    membership = randomUUID();
  productionRecord = randomUUID();
  await instance.db.transaction(async (sql) => {
    await sql.query('INSERT INTO organisations(id,name) VALUES($1,$2)', [
      org,
      'Isolated notification contract',
    ]);
    await sql.query(
      "INSERT INTO platform_client_states(organisation_id,environment) VALUES($1,'production')",
      [org],
    );
    for (const id of [uid, coordinatorId]) {
      await sql.query(
        "INSERT INTO users(id,email,name,password_hash,environment,is_synthetic) VALUES($1,$2,'Contract recipient','unused','production',false)",
        [id, id + '@example.invalid'],
      );
      await sql.query(
        "INSERT INTO identities(id,user_id,issuer,subject) VALUES($1,$2::uuid,'https://idp.example.invalid',$2::text)",
        [randomUUID(), id],
      );
    }
    await sql.query(
      "INSERT INTO client_memberships(id,organisation_id,environment,user_id) VALUES($1,$2,'production',$3)",
      [membership, org, uid],
    );
    await sql.query(
      "INSERT INTO role_assignments(id,user_id,role,organisation_id,environment,client_membership_id,scope_type,scope_key,granted_by,reason) VALUES($1,$2,'member',$3,'production',$4,'client',$5,$2,'Notification fixture')",
      [randomUUID(), uid, org, membership, 'client:' + org],
    );
    await sql.query(
      "INSERT INTO enrolments(id,organisation_id,environment,member_id,member_membership_id,coordinator_id,title) VALUES($1,$2,'production',$3,$4,$5,'Private title excluded from email')",
      [productionRecord, org, uid, membership, coordinatorId],
    );
  });
  return productionRecord;
}
it('sends only a secure workspace link and records relay acceptance with no duplicate', async () => {
  const messages: NoticeMessage[] = [];
  const service = new LearningNotices(
    enrolments,
    {
      configured: () => true,
      send: async (message) => {
        messages.push(message);
      },
    },
    'https://training.example.invalid',
  );
  const n = await add('assessment_review', await production());
  const job = await send(service);
  await expect(service.process(job)).rejects.toMatchObject({ code: 'lease_lost' });
  expect(messages).toHaveLength(1);
  expect(messages[0].url).toBe('https://training.example.invalid/assessments');
  expect(Object.keys(messages[0]).sort()).toEqual(['to', 'url']);
  expect((await notice(n.id)).status).toBe('relay_accepted');
});
it('bounds explicit transient rejection to four attempts and never retries unknown outcomes', async () => {
  let calls = 0;
  const service = new LearningNotices(
    enrolments,
    {
      configured: () => true,
      send: async () => {
        calls++;
        throw { responseCode: 421 };
      },
    },
    'https://training.example.invalid',
  );
  const n = await add('review_needed', await production());
  for (let i = 0; i < 4; i++) {
    await send(service);
    await instance.db.pool.query(
      'UPDATE learning_notifications SET available_at=now() WHERE id=$1',
      [n.id],
    );
    await service.recover();
  }
  expect(calls).toBe(4);
  expect((await notice(n.id)).status).toBe('failed');
  expect(await claim(instance.db, ['learning.notice'])).toBeUndefined();
  const unknown = await add('review_needed', productionRecord);
  await send(
    new LearningNotices(
      enrolments,
      {
        configured: () => true,
        send: async () => {
          throw new Error('closed after DATA');
        },
      },
      'https://training.example.invalid',
    ),
  );
  await service.recover();
  expect((await notice(unknown.id)).status).toBe('ambiguous');
  expect(await claim(instance.db, ['learning.notice'])).toBeUndefined();
  expect(mailOutcome({ responseCode: 550 }, 1).status).toBe('failed');
  expect(mailOutcome({ responseCode: 250 }, 1).status).toBe('ambiguous');
});
it('keeps unconfigured or insecure live delivery in app without contacting SMTP', async () => {
  expect(new SmtpNoticeMail().configured()).toBe(false);
  const n = await add('feedback_ready', await production());
  await send(
    new LearningNotices(
      enrolments,
      {
        configured: () => false,
        send: async () => {
          throw new Error('Not allowed');
        },
      },
      'https://training.example.invalid',
    ),
  );
  expect((await notice(n.id)).error_code).toBe('smtp_not_configured');
  const insecure = await add('feedback_ready', productionRecord);
  await send(
    new LearningNotices(
      enrolments,
      {
        configured: () => true,
        send: async () => {
          throw new Error('Not allowed');
        },
      },
      'http://training.example.invalid',
    ),
  );
  expect((await notice(insecure.id)).error_code).toBe('secure_origin_required');
  const invalid = await add('feedback_ready', productionRecord);
  await send(
    new LearningNotices(
      enrolments,
      {
        configured: () => true,
        send: async () => {
          throw new Error('Not allowed');
        },
      },
      'invalid origin',
    ),
  );
  expect((await notice(invalid.id)).error_code).toBe('secure_origin_required');
});

it('rechecks authority after a committed sending claim before contacting the transport', async () => {
  let calls = 0;
  const service = new LearningNotices(
    enrolments,
    {
      configured: () => true,
      send: async () => {
        calls++;
      },
    },
    'https://training.example.invalid',
  );
  const n = await add('review_needed', await production());
  const original = service.state.bind(service);
  let checks = 0;
  service.state = async (sql, notice) => {
    const state = await original(sql, notice);
    if (++checks === 1)
      await sql.query(
        "UPDATE role_assignments SET ends_at=now() WHERE user_id=$1 AND role='member'",
        [notice.recipient_id],
      );
    return state;
  };
  await send(service);
  expect(checks).toBe(2);
  expect(calls).toBe(0);
  expect((await notice(n.id)).status).toBe('cancelled');
});
