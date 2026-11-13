import { Operations } from '../packages/domain/src/operations.js';
import { EvidenceFiles } from '../packages/domain/src/evidence-files.js';
import { Enrolments } from '../packages/domain/src/enrolments.js';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Promotions } from '../packages/domain/src/promotions.js';
import { MockIdentity } from '../packages/domain/src/mock-identity.js';
import { SandboxDirectory } from '../packages/domain/src/sandbox-directory.js';
import { recordNotice } from '../packages/domain/src/notification-records.js';
import type { Enrolment } from '../packages/domain/src/enrolments.js';
import { describe, it, expect, vi } from 'vitest';
import { Database } from '../packages/database/src/database.js';
import { migrate } from '../packages/database/src/migrate.js';
import { fixture, actor, org, other } from './helpers.js';
import { enqueue, claim } from '../packages/domain/src/outbox.js';
import { Auth, type AuthUser } from '../packages/domain/src/auth.js';
import { Accounts } from '../packages/domain/src/accounts.js';
import { passwordHash } from '../packages/domain/src/crypto.js';
import { Platform } from '../packages/domain/src/platform.js';
import { randomUUID, randomBytes } from 'node:crypto';
const url = process.env.TEST_POSTGRES_URL;
describe.skipIf(!url)('real PostgreSQL isolation and concurrency', () => {
  it('uses a dedicated empty test database, enforces RLS, and claims jobs once', async () => {
    if (!new URL(url!).pathname.endsWith('_test'))
      throw new Error('TEST_POSTGRES_URL database must end with _test');
    const db = new Database(url);
    try {
      const tables = await db.pool.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='public'",
      );
      if (tables.rowCount)
        throw new Error(
          'PostgreSQL qualification requires a new empty test database; nothing was changed.',
        );
      await migrate(db);
      await fixture(db);
      const scope = { actorId: actor, organisationId: org, environment: 'test' as const };
      const results = await Promise.all(
        [org, other].map((organisationId) =>
          db.scoped(
            { ...scope, organisationId },
            async (sql) => (await sql.query('SELECT organisation_id FROM client_memberships')).rows,
          ),
        ),
      );
      expect(results).toEqual([[{ organisation_id: org }], [{ organisation_id: other }]]);
      await db.scoped(scope, (sql) => enqueue(sql, scope, 'test', randomUUID(), {}));
      const claims = await Promise.all([claim(db), claim(db)]);
      expect(claims.filter(Boolean)).toHaveLength(1);
      await db.pool.query(
        "INSERT INTO identities(id,user_id,issuer,subject) VALUES($1,$2::uuid,'urn:training:local',$2::text)",
        [randomUUID(), actor],
      );
      await db.pool.query(
        "INSERT INTO platform_client_states(organisation_id,environment) VALUES($1,'test'),($2,'test')",
        [org, other],
      );
      const second = randomUUID(),
        firstGrant = randomUUID(),
        secondGrant = randomUUID();
      await db.pool.query(
        "INSERT INTO users(id,email,name,password_hash,environment) VALUES($1,'second@example.invalid','Second','not-a-password','test')",
        [second],
      );
      await db.pool.query(
        "INSERT INTO identities(id,user_id,issuer,subject) VALUES($1,$2::uuid,'urn:training:local',$2::text)",
        [randomUUID(), second],
      );
      await db.pool.query(
        "INSERT INTO role_assignments(id,user_id,role,environment,scope_type,scope_key,granted_by,reason) VALUES($1,$2,'admin','test','platform','platform',$2,'Concurrency fixture'),($3,$4,'admin','test','platform','platform',$2,'Concurrency fixture')",
        [firstGrant, actor, secondGrant, second],
      );
      const auth = new Auth(db, randomBytes(32)),
        platform = new Platform(auth);
      const makeSession = async (id: string) =>
        db.transaction(async (sql) => {
          const user = (
            await sql.query<AuthUser>(
              'SELECT id,name,email,environment,permission_version,global_admin FROM users WHERE id=$1',
              [id],
            )
          ).rows[0];
          return auth.newSession(sql, user);
        });
      const firstSession = await makeSession(actor),
        secondSession = await makeSession(second);
      const revocations = await Promise.allSettled([
        platform.revoke(
          firstSession.token,
          firstSession.csrf,
          secondGrant,
          'Concurrent revoke test',
        ),
        platform.revoke(
          secondSession.token,
          secondSession.csrf,
          firstGrant,
          'Concurrent revoke test',
        ),
      ]);
      expect(revocations.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const surviving = (
        await db.pool.query(
          "SELECT user_id FROM role_assignments WHERE scope_type='platform' AND ends_at IS NULL",
        )
      ).rows;
      expect(surviving).toHaveLength(1);
      const survivor = surviving[0].user_id === actor ? firstSession : secondSession;
      const edits = await Promise.allSettled([
        platform.client(
          survivor.token,
          survivor.csrf,
          org,
          'First edit',
          0,
          'Concurrent rename test',
        ),
        platform.client(
          survivor.token,
          survivor.csrf,
          org,
          'Second edit',
          0,
          'Concurrent rename test',
        ),
      ]);
      expect(edits.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(edits.find((r) => r.status === 'rejected')).toMatchObject({ reason: { status: 409 } });

      const adminPassword = 'Isolated PostgreSQL administrator passphrase';
      await db.pool.query('UPDATE users SET password_hash=$2 WHERE id=$1', [
        surviving[0].user_id,
        await passwordHash(adminPassword),
      ]);
      const accounts = new Accounts(auth);
      const issued = await accounts.create(survivor.token, survivor.csrf, {
        clientId: org,
        name: 'Concurrent recipient',
        email: 'concurrent@example.invalid',
        password: adminPassword,
        reason: 'Concurrent redemption verification',
        mode: 'new',
        synthetic: true,
      });
      const firstGuest = await auth.context(),
        secondGuest = await auth.context();
      const recipientPassword = 'Isolated recipient password for tests';
      const redemptions = await Promise.allSettled([
        accounts.redeem(
          firstGuest.token!,
          firstGuest.csrf,
          issued.token,
          'setup',
          recipientPassword,
          recipientPassword,
        ),
        accounts.redeem(
          secondGuest.token!,
          secondGuest.csrf,
          issued.token,
          'setup',
          recipientPassword,
          recipientPassword,
        ),
      ]);
      expect(redemptions.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(redemptions.find((r) => r.status === 'rejected')).toMatchObject({
        reason: { status: 410 },
      });

      const definition = randomUUID(),
        media = randomUUID(),
        enrolment = randomUUID();
      await db.pool.query(
        "INSERT INTO assessment_definitions(id,organisation_id,environment,family_id,revision,actor_id,title,status,questions,rubric,answer_key) VALUES($1,$2,'test',$1,1,$3,'RLS assessment','draft','[]','{}','encrypted fixture')",
        [definition, org, actor],
      );
      await db.pool.query(
        "INSERT INTO assessment_media(id,organisation_id,environment,actor_id,path,source_hash,status) VALUES($1,$2,'test',$3,'fixture','fixture','quarantined')",
        [media, org, actor],
      );
      await db.pool.query(
        "INSERT INTO enrolments(id,organisation_id,environment,member_id,member_membership_id,coordinator_id,title) VALUES($1,$2,'test',$3,'30000000-0000-4000-8000-000000000001',$4,'RLS enrolment')",
        [enrolment, org, actor, second],
      );

      const assignment = randomUUID(),
        assignmentTeam = randomUUID(),
        assignmentRule = randomUUID();
      await db.pool.query(
        "INSERT INTO groups(id,organisation_id,environment,name,kind) VALUES($1,$2,'test','RLS team','team')",
        [assignmentTeam, org],
      );
      await db.pool.query(
        "INSERT INTO assessment_team_rules(id,organisation_id,environment,definition_id,group_id,actor_id) VALUES($1,$2,'test',$3,$4,$5)",
        [assignmentRule, org, definition, assignmentTeam, actor],
      );
      const assignmentRaces = await Promise.all(
        [assignment, randomUUID()].map((id) =>
          db.pool.query(
            "INSERT INTO assessment_assignments(id,organisation_id,environment,definition_id,enrolment_id,actor_id,team_rule_id) VALUES($1,$2,'test',$3,$4,$5,$6) ON CONFLICT(definition_id,enrolment_id) DO NOTHING RETURNING id",
            [id, org, definition, enrolment, actor, assignmentRule],
          ),
        ),
      );
      expect(assignmentRaces.filter((r) => r.rowCount === 1)).toHaveLength(1);

      await db.pool.query(
        "INSERT INTO evidence_files(id,organisation_id,environment,enrolment_id,uploaded_by,storage_key,original_name,mime,bytes,sha256,purpose) VALUES($1,$2,'test',$3,$4,$5,'fixture.txt','text/plain',5,'fixture','evidence')",
        [randomUUID(), org, enrolment, actor, randomUUID()],
      );

      const attempt = randomUUID(),
        assignedId = assignmentRaces.find((r) => r.rowCount === 1)!.rows[0].id,
        submissionKey = randomUUID();
      const submissions = await Promise.allSettled(
        [attempt, randomUUID()].map((id, index) =>
          db.pool.query(
            "INSERT INTO assessment_attempts(id,organisation_id,environment,assignment_id,number,draft_version,idempotency_key,snapshot,content_hash) VALUES($1,$2,'test',$3,$4,1,$5,'encrypted fixture','fixture')",
            [id, org, assignedId, index + 1, submissionKey],
          ),
        ),
      );
      expect(submissions.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const pinned = (
        await db.pool.query('SELECT id FROM assessment_attempts WHERE assignment_id=$1', [
          assignedId,
        ])
      ).rows[0].id;
      await expect(
        db.pool.query("UPDATE assessment_attempts SET snapshot='changed' WHERE id=$1", [pinned]),
      ).rejects.toThrow('immutable');
      await expect(
        db.pool.query('DELETE FROM assessment_attempts WHERE id=$1', [pinned]),
      ).rejects.toThrow('immutable');

      const reviewId = randomUUID(),
        confirmationId = randomUUID();
      await db.pool.query(
        "INSERT INTO assessment_reviews(id,organisation_id,environment,assignment_id,attempt_id,actor_id,sequence,kind,status,result,reason) VALUES($1,$2,'test',$3,$4,$5,1,'decision','approved','encrypted result','Fixture decision')",
        [reviewId, org, assignedId, pinned, actor],
      );
      const fileId = (
        await db.pool.query('SELECT id FROM evidence_files WHERE enrolment_id=$1', [enrolment])
      ).rows[0].id;
      await db.pool.query(
        "INSERT INTO assessment_file_confirmations(id,organisation_id,environment,attempt_id,evidence_file_id,actor_id,source_hash,version,text,reason) VALUES($1,$2,'test',$3,$4,$5,'fixture',2,'encrypted text','Fixture confirmation')",
        [confirmationId, org, pinned, fileId, actor],
      );
      const appealRace = await Promise.allSettled(
        [randomUUID(), randomUUID()].map((id) =>
          db.pool.query(
            "INSERT INTO assessment_appeals(id,organisation_id,environment,assignment_id,review_id,reason) VALUES($1,$2,'test',$3,$4,'Fixture appeal')",
            [id, org, assignedId, reviewId],
          ),
        ),
      );
      expect(appealRace.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      await expect(
        db.pool.query("UPDATE assessment_reviews SET result='changed' WHERE id=$1", [reviewId]),
      ).rejects.toThrow('immutable');
      await expect(
        db.pool.query('DELETE FROM assessment_reviews WHERE id=$1', [reviewId]),
      ).rejects.toThrow('immutable');
      await expect(
        db.pool.query("UPDATE assessment_file_confirmations SET text='changed' WHERE id=$1", [
          confirmationId,
        ]),
      ).rejects.toThrow('immutable');
      const aiRun = randomUUID(),
        aiBlock = randomUUID();
      await db.pool.query(
        "INSERT INTO ai_policies(id,organisation_id,environment,task,version,routing,actor_id) VALUES($1,$2,'test','assess_initial',1,'[\"mock\"]',$3)",
        [randomUUID(), org, actor],
      );
      await db.pool.query(
        "INSERT INTO ai_runs(id,organisation_id,environment,enrolment_id,actor_id,idempotency_key,payload_hash,task,subject_id,status,configuration,task_input,reserved) VALUES($1::uuid,$2,'test',$3,$4,$1::text,'fixture','assess_initial',$5,'queued','{}','encrypted fixture',100)",
        [aiRun, org, enrolment, actor, reviewId],
      );
      await db.pool.query(
        "INSERT INTO ai_blocks(id,organisation_id,environment,ai_run_id,block_index) VALUES($1,$2,'test',$3,0)",
        [aiBlock, org, aiRun],
      );
      await db.pool.query(
        "INSERT INTO ai_attempts(id,organisation_id,environment,ai_block_id,number,provider,model,status) VALUES($1,$2,'test',$3,1,'mock','fixture','running')",
        [randomUUID(), org, aiBlock],
      );
      const secondBlock = randomUUID();
      await db.pool.query(
        "INSERT INTO ai_blocks(id,organisation_id,environment,ai_run_id,block_index) VALUES($1,$2,'test',$3,1)",
        [secondBlock, org, aiRun],
      );
      const runningRace = await Promise.allSettled(
        [aiBlock, secondBlock].map((id) =>
          db.pool.query("UPDATE ai_blocks SET status='running' WHERE id=$1", [id]),
        ),
      );
      expect(runningRace.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      await db.pool.query('DELETE FROM ai_blocks WHERE id=$1', [secondBlock]);
      const extractionRace = await Promise.allSettled(
        [randomUUID(), randomUUID()].map((id) =>
          db.pool.query(
            "INSERT INTO document_extractions(id,organisation_id,environment,enrolment_id,evidence_file_id,actor_id,assessment_assignment_id,assessment_attempt_id,attempt,status,source_hash) VALUES($1,$2,'test',$3,$4,$5,$6,$7,1,'queued','fixture')",
            [id, org, enrolment, fileId, actor, assignedId, pinned],
          ),
        ),
      );
      expect(extractionRace.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const onboardingId = randomUUID(),
        calendarId = randomUUID(),
        programmeId = randomUUID();
      const onboardingRace = await Promise.allSettled(
        [onboardingId, randomUUID()].map((id) =>
          db.pool.query(
            "INSERT INTO onboarding_versions(id,organisation_id,environment,enrolment_id,version,last_step,data,actor_id) VALUES($1,$2,'test',$3,1,'profile','encrypted fixture',$4) RETURNING id",
            [id, org, enrolment, actor],
          ),
        ),
      );
      expect(onboardingRace.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const savedOnboarding = (
        onboardingRace.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>
      ).value.rows[0].id;
      await db.pool.query(
        "INSERT INTO member_calendars(id,organisation_id,environment,member_id,version,timezone,daily_minutes,weekdays,reason,actor_id) VALUES($1,$2,'test',$3,1,'Asia/Manila',60,'[1,2,3,4,5]','Reviewed calendar',$3)",
        [calendarId, org, actor],
      );
      await db.pool.query(
        "INSERT INTO programme_versions(id,organisation_id,environment,enrolment_id,onboarding_version_id,member_calendar_id,version,content,reason,actor_id) VALUES($1,$2,'test',$3,$4,$5,1,'encrypted fixture','Reviewed inputs',$6)",
        [programmeId, org, enrolment, savedOnboarding, calendarId, actor],
      );
      const generationRace = await Promise.allSettled(
        [randomUUID(), randomUUID()].map((id) =>
          db.pool.query(
            "INSERT INTO ai_runs(id,organisation_id,environment,enrolment_id,actor_id,programme_version_id,idempotency_key,payload_hash,task,subject_id,status,configuration,task_input,reserved) VALUES($1::uuid,$2,'test',$3,$4,$5,$1::text,'fixture','generate_programme',$5,'queued','{}','encrypted fixture',100) RETURNING id",
            [id, org, enrolment, actor, programmeId],
          ),
        ),
      );
      expect(generationRace.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const generationId = (
        generationRace.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>
      ).value.rows[0].id;
      const anotherEnrolment = randomUUID();
      await db.pool.query(
        "INSERT INTO enrolments(id,organisation_id,environment,member_id,member_membership_id,coordinator_id,title) SELECT $1,organisation_id,environment,member_id,member_membership_id,coordinator_id,'Generation scope fixture' FROM enrolments WHERE id=$2",
        [anotherEnrolment, enrolment],
      );
      await expect(
        db.pool.query('UPDATE ai_runs SET enrolment_id=$1 WHERE id=$2', [
          anotherEnrolment,
          generationId,
        ]),
      ).rejects.toThrow('generation_base_scope');
      await db.pool.query(
        'UPDATE ai_runs SET programme_version_id=NULL,result_version_id=$1 WHERE id=$2',
        [programmeId, generationId],
      );
      await expect(
        db.pool.query('UPDATE ai_runs SET enrolment_id=$1 WHERE id=$2', [
          anotherEnrolment,
          generationId,
        ]),
      ).rejects.toThrow('generation_result_scope');
      await db.pool.query('DELETE FROM ai_runs WHERE id=$1', [generationId]);
      await db.pool.query('DELETE FROM enrolments WHERE id=$1', [anotherEnrolment]);
      // Competing approvals serialize on the member before checking and reserving capacity.
      const reserve = () =>
        db.transaction(async (sql) => {
          await sql.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [actor]);
          const { LearningCalendar } = await import('../packages/domain/src/learning-calendar.js');
          await new LearningCalendar().assertCapacity(
            sql,
            {
              member_id: actor,
              environment: 'test',
              timezone: 'Asia/Manila',
              daily_minutes: 60,
              weekdays: [1, 2, 3, 4, 5],
              holidays: [],
              absences: [],
            },
            { '2027-01-11': 45 },
          );
          await sql.query(
            "INSERT INTO capacity_allocations(id,organisation_id,environment,programme_version_id,enrolment_id,member_id,day,minutes) VALUES($1,$2,'test',$3,$4,$5,'2027-01-11',45)",
            [randomUUID(), org, programmeId, enrolment, actor],
          );
        });
      const capacityRace = await Promise.allSettled([reserve(), reserve()]);
      expect(capacityRace.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(
        (capacityRace.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason.code,
      ).toBe('capacity_exceeded');
      await expect(
        db.pool.query('UPDATE onboarding_versions SET version=2 WHERE id=$1', [savedOnboarding]),
      ).rejects.toThrow('immutable');
      await expect(
        db.pool.query('DELETE FROM member_calendars WHERE id=$1', [calendarId]),
      ).rejects.toThrow('immutable');
      await db.pool.query("UPDATE programme_versions SET state='needs_review' WHERE id=$1", [
        programmeId,
      ]);
      await db.pool.query("UPDATE programme_versions SET state='approved' WHERE id=$1", [
        programmeId,
      ]);
      await db.pool.query(
        "INSERT INTO programme_approvals(id,organisation_id,environment,programme_version_id,actor_id,reason,content_hash) VALUES($1,$2,'test',$3,$4,'Qualified exact approval','fixture hash')",
        [randomUUID(), org, programmeId, actor],
      );
      await db.pool.query(
        "INSERT INTO approved_changes(event_id,organisation_id,environment,enrolment_id,entity_id,entity_version,kind,facts) VALUES($1,$2,'test',$3,$4,1,'programme.approved','{}')",
        [randomUUID(), org, enrolment, programmeId],
      );
      await expect(
        db.pool.query("UPDATE programme_versions SET content='changed' WHERE id=$1", [programmeId]),
      ).rejects.toThrow('immutable');
      await expect(
        db.pool.query("UPDATE programme_versions SET state='draft' WHERE id=$1", [programmeId]),
      ).rejects.toThrow('state transition');
      await expect(
        db.pool.query('DELETE FROM programme_approvals WHERE programme_version_id=$1', [
          programmeId,
        ]),
      ).rejects.toThrow('immutable');
      const deliveryBlock = randomUUID(),
        submissionId = randomUUID();
      await db.pool.query(
        "INSERT INTO learning_blocks(id,organisation_id,environment,enrolment_id,programme_version_id,member_calendar_id,number,version,content,rubric,actor_id,reason) VALUES($1,$2,'test',$3,$4,$5,1,1,'encrypted content','encrypted rubric',$6,'Reviewed activation')",
        [deliveryBlock, org, enrolment, programmeId, calendarId, actor],
      );
      await db.pool.query(
        "INSERT INTO work_drafts(id,organisation_id,environment,enrolment_id,learning_block_id,lesson_index,member_id,version,payload) VALUES($1,$2,'test',$3,$4,0,$5,1,'encrypted draft')",
        [randomUUID(), org, enrolment, deliveryBlock, actor],
      );
      await db.pool.query(
        "INSERT INTO objective_quizzes(id,organisation_id,environment,enrolment_id,learning_block_id,lesson_index,questions,answer_key,actor_id,reason) VALUES($1,$2,'test',$3,$4,0,'encrypted questions','encrypted key',$5,'Reviewed quiz')",
        [randomUUID(), org, enrolment, deliveryBlock, actor],
      );
      const deliverySubmissionKey = randomUUID();
      const submissionRace = await Promise.allSettled(
        [submissionId, randomUUID()].map((id) =>
          db.pool.query(
            "INSERT INTO submission_attempts(id,organisation_id,environment,enrolment_id,learning_block_id,lesson_index,member_id,attempt,status,payload,content_hash,idempotency_key,draft_version) VALUES($1,$2,'test',$3,$4,0,$5,1,'submitted','encrypted work','hash',$6,1)",
            [id, org, enrolment, deliveryBlock, actor, deliverySubmissionKey],
          ),
        ),
      );
      expect(submissionRace.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      await db.pool.query(
        "INSERT INTO kpi_versions(id,organisation_id,environment,enrolment_id,number,version,definition,effective_at,actor_id,reason) VALUES($1,$2,'test',$3,1,1,'encrypted measure',now(),$4,'Approved measures')",
        [randomUUID(), org, enrolment, actor],
      );
      await db.pool.query(
        "INSERT INTO learning_notifications(id,organisation_id,environment,enrolment_id,recipient_id,event_key,kind) VALUES($1,$2,'test',$3,$4,'activation:fixture','programme_ready')",
        [randomUUID(), org, enrolment, actor],
      );
      for (const [table, field] of [
        ['learning_blocks', 'content'],
        ['submission_attempts', 'payload'],
        ['objective_quizzes', 'answer_key'],
        ['kpi_versions', 'definition'],
      ]) {
        await expect(
          db.pool.query(`UPDATE ${table} SET ${field}='forged' WHERE enrolment_id=$1`, [enrolment]),
        ).rejects.toThrow('immutable');
      }
      const draftRace = await Promise.all(
        [1, 2].map(() =>
          db.pool.query(
            'UPDATE work_drafts SET version=version+1 WHERE learning_block_id=$1 AND version=1 RETURNING id',
            [deliveryBlock],
          ),
        ),
      );
      expect(draftRace.filter((r) => r.rowCount === 1)).toHaveLength(1);
      const savedSubmission = (
        await db.pool.query('SELECT id FROM submission_attempts WHERE learning_block_id=$1', [
          deliveryBlock,
        ])
      ).rows[0].id;
      const gradeRace = await Promise.allSettled(
        [1, 2].map((version) =>
          db.pool.query(
            "INSERT INTO grade_attempts(id,organisation_id,environment,enrolment_id,submission_attempt_id,version,status,rubric_hash,actor_id,reason) VALUES($1,$2,'test',$3,$4,$5,'queued','rubric hash',$6,'Synthetic grading fixture') RETURNING id",
            [randomUUID(), org, enrolment, savedSubmission, version, actor],
          ),
        ),
      );
      expect(gradeRace.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const gradeId = (
        gradeRace.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>
      ).value.rows[0].id;
      await db.pool.query(
        "UPDATE grade_attempts SET status='provisional',result='encrypted result',total=80 WHERE id=$1",
        [gradeId],
      );
      await expect(
        db.pool.query("UPDATE grade_attempts SET result='forged' WHERE id=$1", [gradeId]),
      ).rejects.toThrow('immutable');
      const decisionId = randomUUID();
      await db.pool.query(
        "INSERT INTO grade_decisions(id,organisation_id,environment,enrolment_id,submission_attempt_id,grade_attempt_id,actor_id,outcome,reason,scores,total) VALUES($1,$2,'test',$3,$4,$5,$6,'approved','Human-reviewed evidence','encrypted result',80)",
        [decisionId, org, enrolment, savedSubmission, gradeId, actor],
      );
      await db.pool.query("UPDATE grade_attempts SET status='approved' WHERE id=$1", [gradeId]);
      await db.pool.query(
        "UPDATE submission_attempts SET approved_grade_id=$1,status='approved',version=version+1 WHERE id=$2",
        [gradeId, savedSubmission],
      );
      const learningAppealRace = await Promise.allSettled(
        [1, 2].map(() =>
          db.pool.query(
            "INSERT INTO learning_appeals(id,organisation_id,environment,enrolment_id,submission_attempt_id,grade_decision_id,reason) VALUES($1,$2,'test',$3,$4,$5,'Independent review requested')",
            [randomUUID(), org, enrolment, savedSubmission, decisionId],
          ),
        ),
      );
      expect(learningAppealRace.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const metricId = (
          await db.pool.query('SELECT id FROM kpi_versions WHERE enrolment_id=$1', [enrolment])
        ).rows[0].id,
        observationId = randomUUID();
      await db.pool.query(
        "INSERT INTO kpi_observations(id,organisation_id,environment,enrolment_id,kpi_version_id,submission_attempt_id,grade_decision_id,value,evidence_type,evidence,actor_id) VALUES($1,$2,'test',$3,$4,$5,$6,80,'demonstrated_competence','encrypted evidence',$7)",
        [observationId, org, enrolment, metricId, savedSubmission, decisionId, actor],
      );
      await db.pool.query(
        "INSERT INTO kpi_snapshots(id,organisation_id,environment,enrolment_id,kpi_version_id,source_ids,value,status,sample_count,actor_id) VALUES($1,$2,'test',$3,$4,$5::jsonb,null,'insufficient_evidence',1,$6)",
        [randomUUID(), org, enrolment, metricId, JSON.stringify([observationId]), actor],
      );
      await expect(
        db.pool.query("UPDATE grade_decisions SET scores='forged' WHERE id=$1", [decisionId]),
      ).rejects.toThrow('immutable');
      await expect(
        db.pool.query('UPDATE kpi_observations SET value=100 WHERE id=$1', [observationId]),
      ).rejects.toThrow('immutable');
      await db.pool.query('UPDATE kpi_observations SET current=false WHERE id=$1', [observationId]);
      await expect(
        db.pool.query('UPDATE kpi_observations SET current=true WHERE id=$1', [observationId]),
      ).rejects.toThrow('immutable');
      await expect(
        db.pool.query('DELETE FROM kpi_snapshots WHERE kpi_version_id=$1', [metricId]),
      ).rejects.toThrow('immutable');
      const calendarChangeId = randomUUID();
      await db.pool.query(
        "INSERT INTO calendar_changes(id,organisation_id,environment,enrolment_id,enrolment_version,preview,actor_id,reason) VALUES($1,$2,'test',$3,1,'encrypted preview',$4,'Review planned resumption')",
        [calendarChangeId, org, enrolment, actor],
      );
      await expect(
        db.pool.query("UPDATE calendar_changes SET preview='changed' WHERE id=$1", [
          calendarChangeId,
        ]),
      ).rejects.toThrow();
      const approvalRace = await Promise.all(
        [1, 2].map(() =>
          db.pool.query(
            "UPDATE calendar_changes SET status='approved' WHERE id=$1 AND status='preview' RETURNING id",
            [calendarChangeId],
          ),
        ),
      );
      expect(approvalRace.filter((r) => r.rowCount === 1)).toHaveLength(1);
      await expect(
        db.pool.query("UPDATE calendar_changes SET status='preview' WHERE id=$1", [
          calendarChangeId,
        ]),
      ).rejects.toThrow();
      await expect(
        db.pool.query('DELETE FROM calendar_changes WHERE id=$1', [calendarChangeId]),
      ).rejects.toThrow();
      const adaptationId = randomUUID(),
        suggestionId = randomUUID();
      await db.pool.query(
        "INSERT INTO adaptation_proposals(id,organisation_id,environment,enrolment_id,learning_block_id,member_calendar_id,evidence_block,source_ids,policy_version,status,reason,actor_id) VALUES($1,$2,'test',$3,$4,$5,1,$6::jsonb,'n-plus-two-v1','queued','Support from reviewed evidence',$7)",
        [adaptationId, org, enrolment, deliveryBlock, calendarId, JSON.stringify([gradeId]), actor],
      );
      await db.pool.query(
        "INSERT INTO kpi_suggestions(id,organisation_id,environment,enrolment_id,source_ids,status,actor_id) VALUES($1,$2,'test',$3,$4::jsonb,'queued',$5)",
        [suggestionId, org, enrolment, JSON.stringify([gradeId]), actor],
      );
      await expect(
        db.pool.query("UPDATE adaptation_proposals SET source_ids='[]' WHERE id=$1", [
          adaptationId,
        ]),
      ).rejects.toThrow('immutable');
      await expect(
        db.pool.query(
          "UPDATE adaptation_proposals SET status='approved',approved_by=$2,approved_at=now() WHERE id=$1",
          [adaptationId, actor],
        ),
      ).rejects.toThrow();
      await db.pool.query(
        "UPDATE adaptation_proposals SET status='provisional',replacement='encrypted teaching' WHERE id=$1",
        [adaptationId],
      );
      await expect(
        db.pool.query("UPDATE adaptation_proposals SET replacement='forged' WHERE id=$1", [
          adaptationId,
        ]),
      ).rejects.toThrow('immutable');
      const adaptationRace = await Promise.all(
        [1, 2].map(() =>
          db.pool.query(
            "UPDATE adaptation_proposals SET status='approved',approved_by=$2,approved_at=now() WHERE id=$1 AND status='provisional' RETURNING id",
            [adaptationId, actor],
          ),
        ),
      );
      expect(adaptationRace.filter((r) => r.rowCount === 1)).toHaveLength(1);
      await expect(
        db.pool.query(
          "UPDATE adaptation_proposals SET approved_at=now() + interval '1 hour' WHERE id=$1",
          [adaptationId],
        ),
      ).rejects.toThrow('immutable');
      await db.pool.query(
        "UPDATE adaptation_proposals SET status='source_review_required' WHERE id=$1",
        [adaptationId],
      );
      await expect(
        db.pool.query("UPDATE adaptation_proposals SET status='approved' WHERE id=$1", [
          adaptationId,
        ]),
      ).rejects.toThrow();
      await expect(
        db.pool.query('DELETE FROM adaptation_proposals WHERE id=$1', [adaptationId]),
      ).rejects.toThrow('immutable');
      await db.pool.query(
        "UPDATE kpi_suggestions SET status='provisional',actions='encrypted actions' WHERE id=$1",
        [suggestionId],
      );
      await expect(
        db.pool.query("UPDATE kpi_suggestions SET actions='forged' WHERE id=$1", [suggestionId]),
      ).rejects.toThrow('immutable');
      await expect(
        db.pool.query("UPDATE kpi_suggestions SET status='queued' WHERE id=$1", [suggestionId]),
      ).rejects.toThrow('immutable');
      await expect(
        db.pool.query('DELETE FROM kpi_suggestions WHERE id=$1', [suggestionId]),
      ).rejects.toThrow('immutable');
      for (const table of [
        'adaptation_proposals',
        'kpi_suggestions',
        'calendar_changes',
        'grade_attempts',
        'grade_decisions',
        'learning_appeals',
        'kpi_observations',
        'kpi_snapshots',
        'learning_blocks',
        'work_drafts',
        'objective_quizzes',
        'submission_attempts',
        'kpi_versions',
        'learning_notifications',
        'programme_approvals',
        'approved_changes',
        'onboarding_versions',
        'member_calendars',
        'programme_versions',
        'capacity_allocations',
        'document_extractions',
        'ai_policies',
        'ai_runs',
        'ai_blocks',
        'ai_attempts',
        'assessment_reviews',
        'assessment_file_confirmations',
        'assessment_appeals',
        'assessment_attempts',
        'evidence_files',
        'assessment_definitions',
        'assessment_media',
        'enrolments',
        'assessment_assignments',
        'assessment_team_rules',
      ]) {
        expect(
          await db.scoped(
            scope,
            async (sql) => (await sql.query('SELECT * FROM ' + table)).rowCount,
          ),
        ).toBe(1);
        expect(
          await db.scoped(
            { ...scope, organisationId: other },
            async (sql) => (await sql.query('SELECT * FROM ' + table)).rowCount,
          ),
        ).toBe(0);
      }
      const noticeEnrolment = (
        await db.pool.query<Enrolment>('SELECT * FROM enrolments WHERE id=$1', [enrolment])
      ).rows[0];
      await Promise.all(
        [1, 2].map(() =>
          db.transaction((sql) =>
            recordNotice(sql, noticeEnrolment, actor, 'notification-race', 'review_needed'),
          ),
        ),
      );
      const noticeRace = (
        await db.pool.query(
          "SELECT id FROM learning_notifications WHERE event_key='notification-race'",
        )
      ).rows;
      expect(noticeRace).toHaveLength(1);
      expect(
        (
          await db.pool.query(
            "SELECT id FROM outbox_events WHERE kind='learning.notice' AND payload->>'noticeId'=$1",
            [noticeRace[0].id],
          )
        ).rowCount,
      ).toBe(1);
      const metricRevisionRace = await Promise.allSettled(
        [1, 2].map(() =>
          db.pool.query(
            'INSERT INTO kpi_versions(id,organisation_id,environment,enrolment_id,number,version,definition,effective_at,actor_id,reason) SELECT $1,organisation_id,environment,enrolment_id,number,version+1,definition,now(),actor_id,reason FROM kpi_versions WHERE id=$2',
            [randomUUID(), metricId],
          ),
        ),
      );
      expect(metricRevisionRace.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(metricRevisionRace.filter((r) => r.status === 'rejected')).toHaveLength(1);
      const revisions = await Promise.all(
        [1, 2].map((number) =>
          db.pool.query(
            'UPDATE assessment_definitions SET title=$1,version=version+1 WHERE id=$2 AND version=1 RETURNING id',
            ['Concurrent draft ' + number, definition],
          ),
        ),
      );
      expect(revisions.filter((r) => r.rowCount === 1)).toHaveLength(1);
      await db.pool.query(
        "UPDATE assessment_definitions SET status='published',version=version+1 WHERE id=$1",
        [definition],
      );
      await expect(
        db.pool.query('UPDATE assessment_definitions SET title=$1 WHERE id=$2', [
          'Forbidden mutation',
          definition,
        ]),
      ).rejects.toThrow('immutable');
      await expect(
        db.pool.query('DELETE FROM assessment_definitions WHERE id=$1', [definition]),
      ).rejects.toThrow('immutable');
      const promotionService = new Promotions(auth, randomBytes(32));
      await promotionService.enrolments.tenancy.select(survivor.token, survivor.csrf, org);
      const promoteUser = randomUUID(),
        promoteKey = randomUUID();
      await db.pool.query(
        "INSERT INTO users(id,name,email,password_hash,environment,is_synthetic) VALUES($1,'Promotion race',$2,'disabled','test',false)",
        [promoteUser, promoteUser + '@example.invalid'],
      );
      await db.pool.query(
        "INSERT INTO identities(id,user_id,issuer,subject) VALUES($1,$2::uuid,'https://idp.example.invalid',$2::text)",
        [randomUUID(), promoteUser],
      );
      await db.pool.query(
        "INSERT INTO client_memberships(id,organisation_id,environment,user_id) VALUES($1,$2,'test',$3)",
        [randomUUID(), org, promoteUser],
      );
      const requests = await Promise.all(
        [1, 2].map(() =>
          promotionService.request(survivor.token, survivor.csrf, org, {
            userId: promoteUser,
            key: promoteKey,
            reason: 'Concurrent promotion qualification',
          }),
        ),
      );
      expect(requests[0].id).toBe(requests[1].id);
      const queues = await Promise.allSettled(
        [1, 2].map(() =>
          promotionService.queue(
            survivor.token,
            survivor.csrf,
            org,
            requests[0].id,
            false,
            'Concurrent promotion qualification',
          ),
        ),
      );
      expect(queues.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(queues.filter((r) => r.status === 'rejected')).toHaveLength(1);
      expect(
        (
          await db.pool.query(
            "SELECT id FROM outbox_events WHERE kind='person.promote' AND payload->>'promotionId'=$1",
            [requests[0].id],
          )
        ).rowCount,
      ).toBe(1);
      await expect(
        db.scoped(scope, (sql) => sql.query('SELECT payload FROM promotions')),
      ).rejects.toThrow('permission denied');
      await expect(
        db.pool.query("UPDATE promotions SET payload='changed' WHERE id=$1", [requests[0].id]),
      ).rejects.toThrow('immutable');
      vi.stubEnv('NODE_ENV', 'test');
      vi.stubEnv('TRAINING_AUTH_MODE', 'mock');
      vi.stubEnv('TRAINING_ENVIRONMENT', 'test');
      vi.stubEnv('MOCK_IDENTITY_ENABLED', 'true');
      try {
        const mockUser = randomUUID(),
          mockIdentity = randomUUID();
        await db.pool.query(
          "INSERT INTO users(id,email,name,password_hash,environment,is_synthetic) VALUES($1,'mock-postgres@example.invalid','Mock race','disabled','test',true)",
          [mockUser],
        );
        await db.pool.query(
          "INSERT INTO identities(id,user_id,issuer,subject) VALUES($1,$2,'https://identity.example.invalid/mock',$3)",
          [mockIdentity, mockUser, mockUser],
        );
        const guest = await auth.context();
        const rotations = await Promise.allSettled([
          auth.mockLogin(guest.token!, guest.csrf, mockIdentity),
          auth.mockLogin(guest.token!, guest.csrf, mockIdentity),
        ]);
        expect(rotations.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        expect(rotations.filter((r) => r.status === 'rejected')).toHaveLength(1);
        expect(
          (
            await db.pool.query(
              "SELECT identity_id FROM sessions WHERE user_id=$1 AND authentication_mode='mock'",
              [mockUser],
            )
          ).rows,
        ).toEqual([{ identity_id: mockIdentity }]);
        await expect(
          db.pool.query(
            'UPDATE sessions SET identity_id=(SELECT id FROM identities WHERE user_id=$1 LIMIT 1) WHERE user_id=$2',
            [actor, mockUser],
          ),
        ).rejects.toThrow();
        const operations = new Operations(
          new EvidenceFiles(
            new Enrolments(auth),
            undefined,
            path.join(tmpdir(), 'tracker-retention-' + randomUUID()),
          ),
        );
        const retentionFile = randomUUID(),
          holdId = randomUUID();
        await db.pool.query(
          "INSERT INTO evidence_files(id,organisation_id,environment,enrolment_id,uploaded_by,storage_key,original_name,mime,bytes,sha256,purpose,created_at) VALUES($1,$2,'test',$3,$4,$5,'retention.txt','text/plain',5,'fixture','evidence',now()-interval '25 months')",
          [retentionFile, org, enrolment, actor, randomUUID()],
        );
        vi.stubEnv('RETENTION_APPROVED', 'true');
        const holdConnection = await db.pool.connect();
        try {
          await holdConnection.query('BEGIN');
          await holdConnection.query('SELECT id FROM organisations WHERE id=$1 FOR UPDATE', [org]);
          await holdConnection.query(
            "INSERT INTO legal_holds(id,organisation_id,environment,enrolment_id,actor_id,reason) VALUES($1,$2,'test',$3,$4,'Concurrent hold preservation')",
            [holdId, org, enrolment, actor],
          );
          const retention = operations.retain(true);
          await holdConnection.query('COMMIT');
          expect((await retention).eligible_files).toBe(0);
        } finally {
          await holdConnection.query('ROLLBACK');
          holdConnection.release();
        }
        expect(
          (
            await db.pool.query('SELECT id FROM deletion_ledger WHERE target_id=$1', [
              retentionFile,
            ])
          ).rowCount,
        ).toBe(0);
        expect(
          await db.scoped(
            { ...scope, organisationId: other },
            async (sql) => (await sql.query('SELECT id FROM legal_holds')).rowCount,
          ),
        ).toBe(0);
        await db.pool.query('UPDATE legal_holds SET released_at=now() WHERE id=$1', [holdId]);
        const retained = await Promise.all([operations.retain(true), operations.retain(true)]);
        expect(retained.map((r) => r.eligible_files).sort()).toEqual([0, 1]);
        expect(
          (
            await db.pool.query('SELECT id FROM deletion_ledger WHERE target_id=$1', [
              retentionFile,
            ])
          ).rowCount,
        ).toBe(1);
        await expect(
          db.pool.query('DELETE FROM deletion_ledger WHERE target_id=$1', [retentionFile]),
        ).rejects.toThrow('immutable');
        expect(
          await db.scoped(
            { ...scope, organisationId: other },
            async (sql) => (await sql.query('SELECT id FROM deletion_ledger')).rowCount,
          ),
        ).toBe(0);
        const directory = new SandboxDirectory(db, new MockIdentity(randomBytes(32)));
        const incoming = {
          event_id: randomUUID(),
          entity_id: 'postgres-directory',
          entity_version: 1,
          environment: 'test',
          source: 'primary-platform',
          event_type: 'person.upserted',
          payload: { display_name: 'Directory race fixture', active: true },
        };
        expect(
          (
            await Promise.all([directory.apply(org, incoming), directory.apply(org, incoming)])
          ).sort(),
        ).toEqual(['applied', 'duplicate']);
        const pages = await Promise.allSettled([
          directory.page(org, null, 'one', []),
          directory.page(org, null, 'two', []),
        ]);
        expect(pages.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        expect(pages.filter((r) => r.status === 'rejected')).toHaveLength(1);
        for (const table of ['directory_people', 'inbound_events', 'integration_cursors']) {
          expect(
            await db.scoped(
              scope,
              async (sql) => (await sql.query('SELECT * FROM ' + table)).rowCount,
            ),
          ).toBe(1);
          expect(
            await db.scoped(
              { ...scope, organisationId: other },
              async (sql) => (await sql.query('SELECT * FROM ' + table)).rowCount,
            ),
          ).toBe(0);
        }
        await expect(
          db.pool.query("UPDATE inbound_events SET outcome='stale' WHERE event_id=$1", [
            incoming.event_id,
          ]),
        ).rejects.toThrow('immutable');
      } finally {
        vi.unstubAllEnvs();
      }
    } finally {
      await db.close();
    }
  });
});
