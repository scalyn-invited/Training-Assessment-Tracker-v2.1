import { invalidateLearningSupport } from './learning-support-invalidation.js';
import { AiGateway, type AiRun } from './ai-gateway.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Sql } from '../../database/src/database.js';
import type { AuthUser } from './auth.js';
import type { Enrolment } from './enrolments.js';
import { Delivery, type Submission } from './delivery.js';
import { LearningKpiRecords } from './learning-kpi-records.js';
import { learningAlternate, openLearningAppeal, type LearningAppeal } from './learning-access.js';
import {
  GRADING_PROMPT,
  objectiveLearningGrade,
  learningGradingInput,
  validateLearningGrade,
  type LearningGradeResult,
} from './learning-grading-contract.js';
import { encrypt, decrypt, digest } from './crypto.js';
import { requireCondition } from './errors.js';
export type LearningGrade = {
  id: string;
  organisation_id: string;
  environment: string;
  enrolment_id: string;
  submission_attempt_id: string;
  version: number;
  status: string;
  result: string | null;
  total: string | null;
  rubric_hash: string;
  actor_id: string;
  reason: string;
  created_at: Date;
};
export type LearningDecision = {
  id: string;
  grade_attempt_id: string;
  actor_id: string;
  outcome: string;
  reason: string;
  scores: string;
  total: string | null;
  created_at: Date;
};
export class LearningGrading {
  readonly kpis: LearningKpiRecords;
  constructor(
    readonly delivery: Delivery,
    readonly gateway?: AiGateway,
  ) {
    this.kpis = new LearningKpiRecords(delivery);
    gateway?.register('grade_submission', {
      prompt: GRADING_PROMPT,
      authorize: (sql, run, actor, e) => this.authorize(sql, run, actor, e),
      validate: (sql, run, input, output) => this.validateOutput(sql, run, input, output),
      receive: (sql, run, output) => this.receive(sql, run, output),
      fail: (sql, run) => this.fail(sql, run),
    });
  }
  get enrolments() {
    return this.delivery.enrolments;
  }
  get db() {
    return this.delivery.db;
  }
  get key() {
    return this.delivery.key;
  }
  async records(sql: Sql, actor: AuthUser, client: string, id: string) {
    const s = (
      await sql.query<Submission>(
        'SELECT * FROM submission_attempts WHERE id=$1 AND organisation_id=$2 AND environment=$3',
        [id, client, actor.environment],
      )
    ).rows[0];
    requireCondition(s, 404, 'submission_unavailable', 'This submission is unavailable.');
    const e = (
      await sql.query<Enrolment>(
        'SELECT * FROM enrolments WHERE id=$1 AND organisation_id=$2 AND environment=$3',
        [s.enrolment_id, client, actor.environment],
      )
    ).rows[0];
    requireCondition(
      e &&
        ((await this.enrolments.permissions(sql, actor, e)).details ||
          (await learningAlternate(sql, actor, id, e))),
      404,
      'submission_unavailable',
      'This submission is unavailable.',
    );
    return { s, e };
  }
  async locked<T>(
    token: string,
    csrf: string,
    client: string,
    id: string,
    work: (sql: Sql, actor: AuthUser, s: Submission, e: Enrolment) => Promise<T>,
  ) {
    return this.db.transaction(async (sql) => {
      await sql.query('SELECT id FROM organisations WHERE id=$1 FOR UPDATE', [client]);
      const initialActor = await this.enrolments.context(sql, token, client, csrf),
        initial = await this.records(sql, initialActor, client, id);
      await sql.query('SELECT id FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [
        [initialActor.id, initial.e.member_id],
      ]);
      await sql.query('SELECT id FROM enrolments WHERE id=$1 FOR UPDATE', [initial.e.id]);
      const actor = await this.enrolments.context(sql, token, client, csrf),
        { s, e } = await this.records(sql, actor, client, id);
      return work(sql, actor, s, e);
    });
  }
  async canReview(sql: Sql, actor: AuthUser, s: Submission, e: Enrolment) {
    if (actor.id === s.member_id) return false;
    if (await openLearningAppeal(sql, s.id)) return learningAlternate(sql, actor, s.id, e);
    return (await this.enrolments.permissions(sql, actor, e)).manage;
  }
  async reviewer(sql: Sql, actor: AuthUser, s: Submission, e: Enrolment) {
    requireCondition(
      await this.canReview(sql, actor, s, e),
      403,
      'grade_forbidden',
      'Current primary reviewer authority or the assigned alternate appeal reviewer is required.',
    );
  }
  current(s: Submission, expected: number) {
    z.number().int().positive().parse(expected);
    requireCondition(
      s.version === expected && s.status !== 'withdrawn',
      409,
      'grade_conflict',
      'The submission changed or was withdrawn. Reload before reviewing.',
    );
  }
  async next(sql: Sql, s: Submission) {
    return Number(
      (
        await sql.query(
          'SELECT coalesce(max(version),0)+1 next FROM grade_attempts WHERE submission_attempt_id=$1',
          [s.id],
        )
      ).rows[0].next,
    );
  }
  async grade(sql: Sql, s: Submission, id: string) {
    const g = (
      await sql.query<LearningGrade>(
        'SELECT * FROM grade_attempts WHERE id=$1 AND submission_attempt_id=$2 AND organisation_id=$3 AND environment=$4',
        [id, s.id, s.organisation_id, s.environment],
      )
    ).rows[0];
    requireCondition(g, 404, 'grade_unavailable', 'This grading attempt is unavailable.');
    return g;
  }
  async runRecords(sql: Sql, run: AiRun) {
    const g = (
      await sql.query<LearningGrade>(
        'SELECT * FROM grade_attempts WHERE id=$1 AND organisation_id=$2 AND environment=$3 AND enrolment_id=$4',
        [run.subject_id, run.organisation_id, run.environment, run.enrolment_id],
      )
    ).rows[0];
    requireCondition(g, 409, 'grade_unavailable', 'The queued grading attempt is unavailable.');
    const s = (
      await sql.query<Submission>(
        'SELECT * FROM submission_attempts WHERE id=$1 AND organisation_id=$2 AND environment=$3 AND enrolment_id=$4',
        [g.submission_attempt_id, run.organisation_id, run.environment, run.enrolment_id],
      )
    ).rows[0];
    requireCondition(s, 409, 'submission_unavailable', 'The submitted work is unavailable.');
    return { g, s };
  }
  async authorize(sql: Sql, run: AiRun, actor: AuthUser, e: Enrolment) {
    await sql.query('SELECT id FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [
      [actor.id, e.member_id],
    ]);
    await sql.query('SELECT id FROM enrolments WHERE id=$1 FOR UPDATE', [e.id]);
    const { g, s } = await this.runRecords(sql, run);
    await this.reviewer(sql, actor, s, e);
    requireCondition(
      g.actor_id === actor.id && g.status === 'queued' && s.status !== 'withdrawn',
      409,
      'grade_changed',
      'The queued grading attempt or submitted work changed.',
    );
  }
  async validateOutput(sql: Sql, run: AiRun, input: Record<string, unknown>, output: unknown) {
    const { s } = await this.runRecords(sql, run),
      validated = validateLearningGrade(output, s.id, this.delivery.submitted(s));
    const given = new Set((input.evidence as { id: string }[]).map((item) => item.id));
    requireCondition(
      validated.result.criteria.every((c) => c.evidence_ids.every((id) => given.has(id))),
      422,
      'unsupplied_evidence',
      'The model cited evidence content it was not supplied.',
    );
    return validated.result;
  }
  async provisional(sql: Sql, g: LearningGrade, s: Submission, e: Enrolment, output: unknown) {
    requireCondition(
      g.status === 'queued' && s.status !== 'withdrawn',
      409,
      'grade_changed',
      'This grading attempt is no longer queued.',
    );
    const validated = validateLearningGrade(output, s.id, this.delivery.submitted(s));
    await sql.query(
      "UPDATE grade_attempts SET status='provisional',result=$1,total=$2,updated_at=now() WHERE id=$3",
      [encrypt(JSON.stringify(validated.result), this.key), validated.total, g.id],
    );
    await sql.query(
      'UPDATE submission_attempts SET status=$1,version=version+1,updated_at=now() WHERE id=$2',
      [s.approved_grade_id ? 'approved' : 'review_pending', s.id],
    );
    await this.delivery.notice(sql, e, g.actor_id, 'graded:' + g.id, 'review_needed');
  }
  async receive(sql: Sql, run: AiRun, output: unknown) {
    const { g, s } = await this.runRecords(sql, run),
      e = (
        await sql.query<Enrolment>(
          'SELECT * FROM enrolments WHERE id=$1 AND organisation_id=$2 AND environment=$3',
          [run.enrolment_id, run.organisation_id, run.environment],
        )
      ).rows[0];
    await this.provisional(sql, g, s, e, output);
  }
  async fail(sql: Sql, run: AiRun) {
    const changed = (
      await sql.query<{ submission_attempt_id: string }>(
        "UPDATE grade_attempts SET status='technical_failure',updated_at=now() WHERE id=$1 AND organisation_id=$2 AND environment=$3 AND status='queued' RETURNING submission_attempt_id",
        [run.subject_id, run.organisation_id, run.environment],
      )
    ).rows[0];
    if (changed)
      await sql.query(
        "UPDATE submission_attempts SET status='technical_failure',version=version+1,updated_at=now() WHERE id=$1 AND approved_grade_id IS NULL AND status<>'withdrawn'",
        [changed.submission_attempt_id],
      );
  }
  async request(
    token: string,
    csrf: string,
    client: string,
    id: string,
    expected: number,
    reason: string,
  ) {
    this.delivery.reason(reason);
    return this.locked(token, csrf, client, id, async (sql, actor, s, e) => {
      await this.reviewer(sql, actor, s, e);
      this.current(s, expected);
      requireCondition(
        !(
          await sql.query(
            "SELECT id FROM grade_attempts WHERE submission_attempt_id=$1 AND status IN ('queued','provisional')",
            [s.id],
          )
        ).rowCount,
        409,
        'grade_pending',
        'Resolve the pending grading attempt first.',
      );
      const version = await this.next(sql, s),
        data = this.delivery.submitted(s),
        gradeId = randomUUID();
      const g = (
        await sql.query<LearningGrade>(
          "INSERT INTO grade_attempts(id,organisation_id,environment,enrolment_id,submission_attempt_id,version,status,rubric_hash,actor_id,reason) VALUES($1,$2,$3,$4,$5,$6,'queued',$7,$8,$9) RETURNING *",
          [
            gradeId,
            client,
            e.environment,
            e.id,
            s.id,
            version,
            digest(JSON.stringify(data.rubric)),
            actor.id,
            reason,
          ],
        )
      ).rows[0];
      const updated = (
        await sql.query<Submission>(
          'UPDATE submission_attempts SET status=$1,version=version+1,updated_at=now() WHERE id=$2 RETURNING *',
          [s.approved_grade_id ? 'approved' : 'queued', s.id],
        )
      ).rows[0];
      let runId: string | null = null;
      if (data.quiz_snapshot)
        await this.provisional(sql, g, updated, e, objectiveLearningGrade(s.id, data));
      else {
        requireCondition(
          this.gateway,
          422,
          'grading_unconfigured',
          'Provisional grading is not configured. Manual review is available.',
        );
        const b = await this.delivery.block(sql, e, s.learning_block_id);
        runId = (
          await this.gateway.requestIn(
            sql,
            actor,
            e,
            'grade_submission',
            g.id,
            learningGradingInput(s.id, data, reason),
            b.programme_version_id,
          )
        ).id;
      }
      await this.enrolments.tenancy.audit(sql, actor, client, 'grade.requested', g.id, reason);
      return {
        id: g.id,
        runId,
        version: updated.version + (data.quiz_snapshot ? 1 : 0),
        status: data.quiz_snapshot ? 'provisional' : 'queued',
      };
    });
  }
  async decideIn(
    sql: Sql,
    actor: AuthUser,
    s: Submission,
    e: Enrolment,
    g: LearningGrade,
    expected: number,
    outcome: string,
    reason: string,
    override?: unknown,
  ) {
    await this.reviewer(sql, actor, s, e);
    this.delivery.reason(reason);
    this.current(s, expected);
    requireCondition(
      ['provisional', 'technical_failure'].includes(g.status),
      409,
      'grade_conflict',
      'This grading attempt changed. Reload before reviewing.',
    );
    requireCondition(
      ['approved', 'changes_requested'].includes(outcome),
      422,
      'grade_outcome',
      'Choose approval or request changes.',
    );
    const validated = validateLearningGrade(
      override ?? (g.result ? JSON.parse(decrypt(g.result, this.key)) : {}),
      s.id,
      this.delivery.submitted(s),
    );
    requireCondition(
      outcome !== 'approved' || validated.total !== null,
      422,
      'grade_insufficient',
      'Insufficient evidence cannot become an official numeric grade. Request evidence or record a supported override.',
    );
    const id = randomUUID();
    await sql.query(
      'INSERT INTO grade_decisions(id,organisation_id,environment,enrolment_id,submission_attempt_id,grade_attempt_id,actor_id,outcome,reason,scores,total) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
      [
        id,
        e.organisation_id,
        e.environment,
        e.id,
        s.id,
        g.id,
        actor.id,
        outcome,
        reason,
        encrypt(JSON.stringify(validated.result), this.key),
        validated.total,
      ],
    );
    await sql.query('UPDATE grade_attempts SET status=$1,updated_at=now() WHERE id=$2', [
      outcome,
      g.id,
    ]);
    let approved = s.approved_grade_id;
    if (outcome === 'approved') {
      if (approved)
        await sql.query(
          "UPDATE grade_attempts SET status='superseded',updated_at=now() WHERE id=$1",
          [approved],
        );
      approved = g.id;
    }
    const status = approved ? 'approved' : 'changes_requested';
    await sql.query(
      'UPDATE submission_attempts SET approved_grade_id=$1,status=$2,version=version+1,updated_at=now() WHERE id=$3',
      [approved, status, s.id],
    );
    if (outcome === 'approved') {
      await this.kpis.grade(sql, actor, e, s, id, validated.total);
      await invalidateLearningSupport(sql, this.delivery, e, s.id, g.id);
      await this.kpis.feed(sql, e, s.id, s.version + 1, 'grade.approved', {
        grade_id: g.id,
        submission_id: s.id,
        total: validated.total,
      });
    }
    await sql.query(
      "UPDATE learning_appeals SET status='resolved',resolved_by=$1,authority_ended_at=now(),resolution=$2,updated_at=now() WHERE submission_attempt_id=$3 AND status='open' AND reviewer_id=$1",
      [actor.id, reason, s.id],
    );
    await this.enrolments.tenancy.audit(
      sql,
      actor,
      e.organisation_id,
      'grade.' + outcome,
      g.id,
      reason,
    );
    await this.delivery.notice(sql, e, s.member_id, 'decision:' + id, 'feedback_ready');
    return { id, gradeId: g.id, version: s.version + 1, status, total: validated.total };
  }
  async decide(
    token: string,
    csrf: string,
    client: string,
    id: string,
    gradeId: string,
    expected: number,
    outcome: string,
    reason: string,
    override?: unknown,
  ) {
    return this.locked(token, csrf, client, id, async (sql, actor, s, e) =>
      this.decideIn(
        sql,
        actor,
        s,
        e,
        await this.grade(sql, s, gradeId),
        expected,
        outcome,
        reason,
        override,
      ),
    );
  }
  async manual(
    token: string,
    csrf: string,
    client: string,
    id: string,
    expected: number,
    outcome: string,
    reason: string,
    result: unknown,
  ) {
    this.delivery.reason(reason);
    return this.locked(token, csrf, client, id, async (sql, actor, s, e) => {
      await this.reviewer(sql, actor, s, e);
      this.current(s, expected);
      requireCondition(
        !(
          await sql.query(
            "SELECT id FROM grade_attempts WHERE submission_attempt_id=$1 AND status='queued'",
            [s.id],
          )
        ).rowCount,
        409,
        'grade_pending',
        'Wait for or reconcile the queued grading attempt first.',
      );
      const validated = validateLearningGrade(result, s.id, this.delivery.submitted(s));
      await sql.query(
        "UPDATE grade_attempts SET status='superseded',updated_at=now() WHERE submission_attempt_id=$1 AND status='provisional'",
        [s.id],
      );
      const gradeId = randomUUID(),
        version = await this.next(sql, s);
      const g = (
        await sql.query<LearningGrade>(
          "INSERT INTO grade_attempts(id,organisation_id,environment,enrolment_id,submission_attempt_id,version,status,result,total,rubric_hash,actor_id,reason) VALUES($1,$2,$3,$4,$5,$6,'provisional',$7,$8,$9,$10,$11) RETURNING *",
          [
            gradeId,
            client,
            e.environment,
            e.id,
            s.id,
            version,
            encrypt(JSON.stringify(validated.result), this.key),
            validated.total,
            digest(JSON.stringify(this.delivery.submitted(s).rubric)),
            actor.id,
            'Human assessment: ' + reason,
          ],
        )
      ).rows[0];
      return this.decideIn(sql, actor, s, e, g, expected, outcome, reason, result);
    });
  }
  async appeal(
    token: string,
    csrf: string,
    client: string,
    id: string,
    expected: number,
    reason: string,
  ) {
    this.delivery.reason(reason);
    return this.locked(token, csrf, client, id, async (sql, actor, s, e) => {
      this.current(s, expected);
      requireCondition(
        actor.id === s.member_id && s.approved_grade_id,
        403,
        'appeal_forbidden',
        'Only the member can appeal an approved decision.',
      );
      const decision = (
        await sql.query<LearningDecision>(
          'SELECT * FROM grade_decisions WHERE grade_attempt_id=$1',
          [s.approved_grade_id],
        )
      ).rows[0];
      requireCondition(
        decision,
        409,
        'decision_unavailable',
        'The approved decision is unavailable.',
      );
      requireCondition(
        !(
          await sql.query(
            "SELECT id FROM learning_appeals WHERE grade_decision_id=$1 OR (submission_attempt_id=$2 AND status='open')",
            [decision.id, s.id],
          )
        ).rowCount,
        409,
        'appeal_exists',
        'This decision already has an appeal or another appeal remains open.',
      );
      const appealId = randomUUID();
      await sql.query(
        'INSERT INTO learning_appeals(id,organisation_id,environment,enrolment_id,submission_attempt_id,grade_decision_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [appealId, client, e.environment, e.id, s.id, decision.id, reason],
      );
      await sql.query(
        'UPDATE submission_attempts SET version=version+1,updated_at=now() WHERE id=$1',
        [s.id],
      );
      await this.enrolments.tenancy.audit(sql, actor, client, 'grade.appealed', appealId, reason);
      const primary = (
        await sql.query<{ user_id: string }>(
          "SELECT cm.user_id FROM coordinator_allocations a JOIN client_memberships cm ON cm.id=a.coordinator_membership_id WHERE a.member_membership_id=$1 AND a.organisation_id=$2 AND a.environment=$3 AND a.kind='primary' AND a.starts_at<=now() AND (a.ends_at IS NULL OR a.ends_at>now()) AND cm.status='active' AND cm.ended_at IS NULL",
          [e.member_membership_id, client, e.environment],
        )
      ).rows[0];
      await this.delivery.notice(
        sql,
        e,
        primary?.user_id ?? null,
        'appeal:' + appealId,
        'appeal_open',
      );
      return { id: appealId, version: s.version + 1 };
    });
  }
  async route(
    token: string,
    csrf: string,
    client: string,
    id: string,
    reviewer: string,
    reason: string,
  ) {
    this.delivery.reason(reason);
    return this.db.transaction(async (sql) => {
      await sql.query('SELECT id FROM organisations WHERE id=$1 FOR UPDATE', [client]);
      const actor = await this.enrolments.context(sql, token, client, csrf);
      requireCondition(
        await this.enrolments.access.role(sql, actor.id, client, actor.environment, 'admin'),
        403,
        'client_admin_required',
        'Client Admin authority is required.',
      );
      const appeal = (
        await sql.query<LearningAppeal>(
          'SELECT * FROM learning_appeals WHERE id=$1 AND organisation_id=$2 AND environment=$3 FOR UPDATE',
          [id, client, actor.environment],
        )
      ).rows[0];
      requireCondition(
        appeal?.status === 'open',
        404,
        'appeal_unavailable',
        'This open appeal is unavailable.',
      );
      const e = (
        await sql.query<Enrolment>(
          'SELECT * FROM enrolments WHERE id=$1 AND organisation_id=$2 AND environment=$3',
          [appeal.enrolment_id, client, actor.environment],
        )
      ).rows[0];
      await sql.query('SELECT id FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [
        [actor.id, reviewer, e.member_id],
      ]);
      await sql.query('SELECT id FROM enrolments WHERE id=$1 FOR UPDATE', [e.id]);
      const prior = (
          await sql.query<LearningDecision>('SELECT * FROM grade_decisions WHERE id=$1', [
            appeal.grade_decision_id,
          ])
        ).rows[0],
        member = await this.enrolments.access.membership(sql, reviewer, client, actor.environment);
      requireCondition(
        e.group_id &&
          member &&
          ![actor.id, e.member_id, prior.actor_id].includes(reviewer) &&
          (await this.enrolments.access.membership(sql, e.member_id, client, actor.environment)) &&
          (await this.enrolments.access.role(
            sql,
            reviewer,
            client,
            actor.environment,
            'coordinator',
            e.group_id,
          )),
        422,
        'invalid_alternate',
        'Choose another active coordinator for this team.',
      );
      const role = (
        await sql.query<{ id: string }>(
          "SELECT id FROM role_assignments WHERE user_id=$1 AND client_membership_id=$2 AND organisation_id=$3 AND environment=$4 AND role='coordinator' AND scope_type='team' AND group_id=$5 AND starts_at<=now() AND (ends_at IS NULL OR ends_at>now()) ORDER BY starts_at,id LIMIT 1",
          [reviewer, member.id, client, actor.environment, e.group_id],
        )
      ).rows[0];
      requireCondition(
        role,
        422,
        'invalid_alternate',
        'An active team coordinator role is required.',
      );
      await sql.query(
        'UPDATE learning_appeals SET reviewer_id=$1,role_assignment_id=$2,authority_granted_at=now(),authority_ended_at=null,updated_at=now() WHERE id=$3',
        [reviewer, role.id, id],
      );
      await this.enrolments.tenancy.audit(sql, actor, client, 'appeal.assigned', id, reason);
      return { id, reviewerId: reviewer };
    });
  }
  async uphold(
    token: string,
    csrf: string,
    client: string,
    id: string,
    expected: number,
    reason: string,
  ) {
    this.delivery.reason(reason);
    return this.locked(token, csrf, client, id, async (sql, actor, s, e) => {
      this.current(s, expected);
      requireCondition(
        await learningAlternate(sql, actor, id, e),
        403,
        'appeal_forbidden',
        'Only the assigned alternate reviewer can resolve this appeal.',
      );
      const appeal = (await openLearningAppeal(sql, id))!;
      await sql.query(
        "UPDATE learning_appeals SET status='resolved',resolved_by=$1,authority_ended_at=now(),resolution=$2,updated_at=now() WHERE id=$3",
        [actor.id, reason, appeal.id],
      );
      await sql.query(
        'UPDATE submission_attempts SET version=version+1,updated_at=now() WHERE id=$1',
        [id],
      );
      await this.enrolments.tenancy.audit(sql, actor, client, 'appeal.upheld', appeal.id, reason);
      return { id, version: s.version + 1 };
    });
  }
  async queue(token: string, client: string, page = 1) {
    z.number().int().min(1).max(100000).parse(page);
    return this.db.transaction(async (sql) => {
      const actor = await this.enrolments.context(sql, token, client);
      const rows = (
        await sql.query<Submission>(
          "SELECT s.* FROM submission_attempts s WHERE s.organisation_id=$1 AND s.environment=$2 AND (s.status IN ('submitted','queued','review_pending','technical_failure') OR EXISTS(SELECT 1 FROM learning_appeals p WHERE p.submission_attempt_id=s.id AND p.reviewer_id=$3 AND p.status='open')) ORDER BY s.created_at,s.id",
          [client, actor.environment, actor.id],
        )
      ).rows;
      const visible = [];
      for (const s of rows) {
        const e = (
          await sql.query<Enrolment>(
            'SELECT * FROM enrolments WHERE id=$1 AND organisation_id=$2 AND environment=$3',
            [s.enrolment_id, client, actor.environment],
          )
        ).rows[0];
        if (e && (await this.canReview(sql, actor, s, e))) {
          const member = (
            await sql.query<{ name: string }>(
              'SELECT name FROM users WHERE id=$1 AND environment=$2',
              [s.member_id, actor.environment],
            )
          ).rows[0];
          visible.push({
            id: s.id,
            enrolmentId: e.id,
            title: e.title,
            memberName: member?.name ?? 'Member',
            attempt: s.attempt,
            status: s.status,
            createdAt: s.created_at,
          });
        }
      }
      return { records: visible.slice((page - 1) * 20, page * 20), total: visible.length, page };
    });
  }
  async routing(token: string, client: string) {
    return this.db.transaction(async (sql) => {
      const actor = await this.enrolments.context(sql, token, client),
        canRoute = await this.enrolments.access.role(
          sql,
          actor.id,
          client,
          actor.environment,
          'admin',
        );
      if (!canRoute) return { canRoute: false, appeals: [] };
      const rows = (
        await sql.query<
          LearningAppeal & { group_id: string | null; member_id: string; prior_actor: string }
        >(
          "SELECT a.*,e.group_id,e.member_id,d.actor_id prior_actor FROM learning_appeals a JOIN enrolments e ON e.id=a.enrolment_id AND e.organisation_id=a.organisation_id AND e.environment=a.environment JOIN grade_decisions d ON d.id=a.grade_decision_id WHERE a.organisation_id=$1 AND a.environment=$2 AND a.status='open' ORDER BY a.created_at,a.id",
          [client, actor.environment],
        )
      ).rows;
      const candidates = (
        await sql.query<{ id: string; name: string }>(
          "SELECT u.id,u.name FROM users u JOIN client_memberships cm ON cm.user_id=u.id AND cm.environment=u.environment WHERE cm.organisation_id=$1 AND cm.environment=$2 AND cm.status='active' AND cm.ended_at IS NULL ORDER BY u.name,u.id",
          [client, actor.environment],
        )
      ).rows;
      const appeals = [];
      for (const row of rows) {
        const reviewers = [];
        if (row.group_id)
          for (const candidate of candidates)
            if (
              ![actor.id, row.member_id, row.prior_actor].includes(candidate.id) &&
              (await this.enrolments.access.role(
                sql,
                candidate.id,
                client,
                actor.environment,
                'coordinator',
                row.group_id,
              ))
            )
              reviewers.push(candidate);
        appeals.push({
          id: row.id,
          submissionId: row.submission_attempt_id,
          reviewerId: row.reviewer_id,
          reviewers,
        });
      }
      return { canRoute: true, appeals };
    });
  }
  async read(token: string, client: string, id: string, enrolmentId?: string) {
    return this.db.transaction(async (sql) => {
      const actor = await this.enrolments.context(sql, token, client),
        { s, e } = await this.records(sql, actor, client, id),
        canReview = await this.canReview(sql, actor, s, e),
        data = this.delivery.submitted(s);
      requireCondition(
        !enrolmentId || enrolmentId === e.id,
        404,
        'submission_unavailable',
        'This submission is unavailable.',
      );
      const decisions = (
        await sql.query<LearningDecision>(
          'SELECT * FROM grade_decisions WHERE submission_attempt_id=$1 ORDER BY created_at DESC,id',
          [s.id],
        )
      ).rows;
      const publicDecision = (d: LearningDecision | undefined) =>
        d
          ? {
              id: d.id,
              reason: d.reason,
              result: JSON.parse(decrypt(d.scores, this.key)) as LearningGradeResult,
              total: d.total === null ? null : Number(d.total),
              createdAt: d.created_at,
            }
          : null;
      const grades = canReview
        ? (
            await sql.query<LearningGrade>(
              'SELECT * FROM grade_attempts WHERE submission_attempt_id=$1 AND ($2::boolean OR actor_id=$3) ORDER BY version DESC',
              [id, (await this.enrolments.permissions(sql, actor, e)).manage, actor.id],
            )
          ).rows.map((g) => ({
            id: g.id,
            version: g.version,
            status: g.status,
            result: g.result
              ? (JSON.parse(decrypt(g.result, this.key)) as LearningGradeResult)
              : null,
            total: g.total === null ? null : Number(g.total),
            reason: g.reason,
            createdAt: g.created_at,
          }))
        : [];
      const appeals = (
        await sql.query<LearningAppeal>(
          'SELECT * FROM learning_appeals WHERE submission_attempt_id=$1 ORDER BY created_at DESC',
          [id],
        )
      ).rows;
      return {
        enrolment: { id: e.id, title: e.title },
        submission: {
          ...this.delivery.receiptSummary(s),
          blockId: s.learning_block_id,
          lessonIndex: s.lesson_index,
          createdAt: s.created_at,
          body: data.body,
          files: data.files,
          answers: data.answers,
          rubric: data.rubric,
          quiz: data.quiz_snapshot
            ? { id: data.quiz_snapshot.id, questions: data.quiz_snapshot.questions }
            : null,
        },
        canReview,
        caseOnly: !(await this.enrolments.permissions(sql, actor, e)).details,
        grades,
        approved: publicDecision(decisions.find((d) => d.grade_attempt_id === s.approved_grade_id)),
        changes: publicDecision(decisions.find((d) => d.outcome === 'changes_requested')),
        appeals: appeals.map((p) => ({
          id: p.id,
          status: p.status,
          reason: p.reason,
          resolution: p.resolution,
          assigned: !!p.reviewer_id,
          canUphold: p.status === 'open' && p.reviewer_id === actor.id && canReview,
        })),
        canAppeal:
          actor.id === s.member_id &&
          !!s.approved_grade_id &&
          !appeals.some(
            (p) =>
              p.status === 'open' ||
              decisions.find((d) => d.id === p.grade_decision_id)?.grade_attempt_id ===
                s.approved_grade_id,
          ),
        canWithdraw:
          actor.id === s.member_id &&
          !s.approved_grade_id &&
          !['approved', 'withdrawn'].includes(s.status),
      };
    });
  }
}
