import { recordNotice } from './notification-records.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Sql } from '../../database/src/database.js';
import type { AuthUser } from './auth.js';
import type { Enrolment } from './enrolments.js';
import type { OnboardingVersion } from './onboarding.js';
import { LearningPlans, type Programme } from './learning-plans.js';
import { EvidenceFiles, type EvidenceFile } from './evidence-files.js';
import type { LearningBlock as BlockContent } from './programme-content.js';
import { encrypt, decrypt, digest } from './crypto.js';
import { requireCondition } from './errors.js';
export type DeliveryBlock = {
  id: string;
  organisation_id: string;
  environment: string;
  enrolment_id: string;
  programme_version_id: string;
  member_calendar_id: string;
  number: number;
  version: number;
  state: string;
  content: string;
  rubric: string;
  started_at: Date | null;
  early_start: boolean;
  actor_id: string;
  reason: string;
};
export type DeliveryRubric = {
  id: string;
  version: number;
  criteria: { id: string; label: string; weight: number; maximum: number; competency: number }[];
};
export type Work = { body: string; files: string[]; answers: (number | null)[] };
export type QuizQuestion = { id: string; prompt: string; options: string[]; criterion_id: string };
export type SubmissionContent = Work & {
  rubric: DeliveryRubric;
  quiz_snapshot: null | {
    id: string;
    questions: QuizQuestion[];
    answer_key: Record<string, number>;
  };
};
export type Submission = {
  id: string;
  organisation_id: string;
  environment: string;
  enrolment_id: string;
  learning_block_id: string;
  lesson_index: number;
  member_id: string;
  attempt: number;
  version: number;
  status: string;
  payload: string;
  content_hash: string;
  idempotency_key: string;
  draft_version: number;
  approved_grade_id: string | null;
  created_at: Date;
};
type Draft = { id: string; version: number; payload: string };
type Quiz = { id: string; questions: string; answer_key: string };
const workSchema = z.object({
  body: z.string().max(30000),
  files: z
    .array(z.uuid())
    .max(5)
    .refine((a) => new Set(a).size === a.length),
  answers: z.array(z.number().int().min(0).max(3).nullable()).max(20),
});
export class Delivery {
  readonly files: EvidenceFiles;
  constructor(
    readonly plans: LearningPlans,
    files?: EvidenceFiles,
  ) {
    this.files =
      files ??
      new EvidenceFiles(plans.onboarding.enrolments, undefined, undefined, plans.onboarding.key);
  }
  get enrolments() {
    return this.plans.onboarding.enrolments;
  }
  get db() {
    return this.enrolments.auth.db;
  }
  get key() {
    return this.plans.onboarding.key;
  }
  content(b: DeliveryBlock): BlockContent {
    return JSON.parse(decrypt(b.content, this.key));
  }
  rubric(b: DeliveryBlock): DeliveryRubric {
    return JSON.parse(decrypt(b.rubric, this.key));
  }
  submitted(s: Submission): SubmissionContent {
    return JSON.parse(decrypt(s.payload, this.key));
  }
  reason(value: string) {
    z.string().trim().min(8).max(2000).parse(value);
  }
  today(timezone: string) {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat('en', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
        .formatToParts(this.plans.now())
        .map((v) => [v.type, v.value]),
    );
    return `${p.year}-${p.month}-${p.day}`;
  }
  async locked<T>(
    token: string,
    csrf: string,
    client: string,
    id: string,
    work: (sql: Sql, actor: AuthUser, e: Enrolment) => Promise<T>,
  ) {
    return this.db.transaction(async (sql) => {
      await sql.query('SELECT id FROM organisations WHERE id=$1 FOR UPDATE', [client]);
      const initialActor = await this.enrolments.context(sql, token, client, csrf),
        initial = await this.enrolments.record(sql, initialActor, client, id, 'details');
      await sql.query('SELECT id FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [
        [initialActor.id, initial.member_id],
      ]);
      await sql.query('SELECT id FROM enrolments WHERE id=$1 FOR UPDATE', [id]);
      const actor = await this.enrolments.context(sql, token, client, csrf),
        e = await this.enrolments.record(sql, actor, client, id, 'details');
      return work(sql, actor, e);
    });
  }
  async block(sql: Sql, e: Enrolment, id: string) {
    const b = (
      await sql.query<DeliveryBlock>(
        'SELECT * FROM learning_blocks WHERE id=$1 AND enrolment_id=$2 AND organisation_id=$3 AND environment=$4',
        [id, e.id, e.organisation_id, e.environment],
      )
    ).rows[0];
    requireCondition(b, 404, 'block_unavailable', 'This learning block is unavailable.');
    return b;
  }
  async notice(sql: Sql, e: Enrolment, recipient: string | null, event: string, kind: string) {
    await recordNotice(sql, e, recipient, event, kind);
  }
  async activate(
    token: string,
    csrf: string,
    client: string,
    id: string,
    expected: number,
    reason: string,
  ) {
    this.reason(reason);
    z.number().int().positive().parse(expected);
    return this.locked(token, csrf, client, id, async (sql, actor, e) => {
      await this.plans.onboarding.authorise(sql, actor, e, true);
      requireCondition(
        e.version === expected && e.status === 'ready',
        409,
        'activation_conflict',
        'The enrolment changed or is not ready.',
      );
      const plan = (
        await sql.query<Programme>(
          "SELECT * FROM programme_versions WHERE enrolment_id=$1 AND organisation_id=$2 AND environment=$3 AND state='approved' ORDER BY version DESC LIMIT 1",
          [e.id, client, e.environment],
        )
      ).rows[0];
      requireCondition(
        plan,
        409,
        'approval_required',
        'Approve the curriculum before activating training.',
      );
      await this.plans.validate(sql, e, plan);
      for (const [index, content] of this.plans.content(plan).blocks.entries()) {
        const blockId = randomUUID(),
          rubric: DeliveryRubric = {
            id: blockId,
            version: 1,
            criteria: [
              {
                id: blockId + ':one',
                label: content.criterion_one!,
                weight: content.weight_one,
                maximum: 100,
                competency: content.competency,
              },
              {
                id: blockId + ':two',
                label: content.criterion_two!,
                weight: content.weight_two,
                maximum: 100,
                competency: content.competency,
              },
            ],
          };
        await sql.query(
          'INSERT INTO learning_blocks(id,organisation_id,environment,enrolment_id,programme_version_id,member_calendar_id,number,version,content,rubric,actor_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7,1,$8,$9,$10,$11)',
          [
            blockId,
            client,
            e.environment,
            e.id,
            plan.id,
            plan.member_calendar_id,
            index + 1,
            encrypt(JSON.stringify(content), this.key),
            encrypt(JSON.stringify(rubric), this.key),
            actor.id,
            reason,
          ],
        );
      }
      const { data } = await this.plans.inputs(sql, e, plan);
      for (const [index, kpi] of (data.measures!.kpis as Record<string, unknown>[]).entries()) {
        const definition = {
          ...kpi,
          formula: kpi.unit === 'percent' ? 'approved_grade_mean' : 'manual_mean',
          direction: 'higher',
          sample_minimum: 3,
          evidence_type: kpi.unit === 'percent' ? 'demonstrated_competence' : 'workplace_outcome',
          owner: actor.id,
        };
        await sql.query(
          'INSERT INTO kpi_versions(id,organisation_id,environment,enrolment_id,number,version,definition,effective_at,actor_id,reason) VALUES($1,$2,$3,$4,$5,1,$6,now(),$7,$8)',
          [
            randomUUID(),
            client,
            e.environment,
            e.id,
            index + 1,
            encrypt(JSON.stringify(definition), this.key),
            actor.id,
            'Initial planning measure; only comparable approved grades count.',
          ],
        );
      }
      await sql.query(
        "UPDATE enrolments SET status='active',version=version+1,updated_at=now() WHERE id=$1",
        [e.id],
      );
      await this.enrolments.tenancy.audit(sql, actor, client, 'enrolment.activated', e.id, reason);
      await this.notice(sql, e, e.member_id, 'activation:' + plan.id, 'programme_ready');
      return { id: e.id, status: 'active', version: e.version + 1 };
    });
  }
  async earlyStart(
    token: string,
    csrf: string,
    client: string,
    id: string,
    blockId: string,
    reason: string,
  ) {
    this.reason(reason);
    return this.locked(token, csrf, client, id, async (sql, actor, e) => {
      await this.plans.onboarding.authorise(sql, actor, e, true);
      const b = await this.block(sql, e, blockId);
      requireCondition(
        e.status === 'active' && b.state === 'current' && !b.started_at,
        409,
        'early_start_conflict',
        'This block is not available for early start.',
      );
      await sql.query(
        'UPDATE learning_blocks SET started_at=now(),early_start=true,updated_at=now() WHERE id=$1',
        [b.id],
      );
      await this.enrolments.tenancy.audit(sql, actor, client, 'block.early_start', b.id, reason);
      return { id: b.id, earlyStart: true };
    });
  }
  working(actor: AuthUser, e: Enrolment, b: DeliveryBlock, index: number) {
    z.number().int().min(0).parse(index);
    requireCondition(
      actor.id === e.member_id,
      403,
      'member_required',
      'Only the enrolled member can save or submit this work.',
    );
    requireCondition(
      e.status === 'active' && b.state === 'current',
      409,
      'lesson_read_only',
      'This enrolment is not active or this block has been replaced.',
    );
    const lesson = this.content(b).lessons[index];
    requireCondition(lesson, 404, 'lesson_unavailable', 'This lesson is unavailable.');
    requireCondition(
      b.early_start || lesson.date <= this.today(e.timezone),
      409,
      'future_lesson',
      'Future lessons are preview only. A coordinator can authorise early start.',
    );
  }
  async evidence(sql: Sql, actor: AuthUser, e: Enrolment, ids: string[]) {
    for (const id of ids) {
      const file = (
        await sql.query<EvidenceFile>(
          'SELECT * FROM evidence_files WHERE id=$1 AND enrolment_id=$2 AND organisation_id=$3 AND environment=$4',
          [id, e.id, e.organisation_id, e.environment],
        )
      ).rows[0];
      requireCondition(
        file && file.scan_status === 'clean' && (await this.files.canRead(sql, actor, file, e)),
        422,
        'invalid_evidence',
        'Use accessible evidence from this enrolment that has passed scanning.',
      );
    }
    return ids;
  }
  async draft(sql: Sql, b: DeliveryBlock, index: number, member: string) {
    return (
      await sql.query<Draft>(
        'SELECT id,version,payload FROM work_drafts WHERE learning_block_id=$1 AND lesson_index=$2 AND member_id=$3 AND organisation_id=$4 AND environment=$5',
        [b.id, index, member, b.organisation_id, b.environment],
      )
    ).rows[0];
  }
  async save(
    token: string,
    csrf: string,
    client: string,
    id: string,
    blockId: string,
    index: number,
    expected: number,
    input: unknown,
  ) {
    z.number().int().min(0).parse(expected);
    const work = workSchema.parse(input);
    return this.locked(token, csrf, client, id, async (sql, actor, e) => {
      const b = await this.block(sql, e, blockId);
      this.working(actor, e, b, index);
      const previous = await this.draft(sql, b, index, actor.id);
      requireCondition(
        (previous?.version ?? 0) === expected,
        409,
        'work_conflict',
        'Your work changed in another window. Copy your text and reload.',
      );
      await this.evidence(sql, actor, e, work.files);
      const draftId = previous?.id ?? randomUUID(),
        payload = encrypt(JSON.stringify(work), this.key);
      if (previous)
        await sql.query(
          'UPDATE work_drafts SET payload=$1,version=version+1,updated_at=now() WHERE id=$2',
          [payload, draftId],
        );
      else
        await sql.query(
          'INSERT INTO work_drafts(id,organisation_id,environment,enrolment_id,learning_block_id,lesson_index,member_id,version,payload) VALUES($1,$2,$3,$4,$5,$6,$7,1,$8)',
          [draftId, client, e.environment, e.id, b.id, index, actor.id, payload],
        );
      if (!b.started_at)
        await sql.query(
          'UPDATE learning_blocks SET started_at=now(),updated_at=now() WHERE id=$1',
          [b.id],
        );
      return { id: draftId, version: expected + 1 };
    });
  }
  async quiz(sql: Sql, b: DeliveryBlock, index: number) {
    return (
      await sql.query<Quiz>(
        'SELECT id,questions,answer_key FROM objective_quizzes WHERE learning_block_id=$1 AND lesson_index=$2 AND organisation_id=$3 AND environment=$4',
        [b.id, index, b.organisation_id, b.environment],
      )
    ).rows[0];
  }
  async eligible(sql: Sql, b: DeliveryBlock) {
    return (
      b.state === 'current' &&
      !b.started_at &&
      new Date(this.content(b).freeze_at) > new Date() &&
      !(
        await sql.query(
          'SELECT id FROM work_drafts WHERE learning_block_id=$1 UNION ALL SELECT id FROM submission_attempts WHERE learning_block_id=$1 LIMIT 1',
          [b.id],
        )
      ).rowCount
    );
  }
  async publishQuiz(
    token: string,
    csrf: string,
    client: string,
    id: string,
    blockId: string,
    index: number,
    input: unknown,
    reason: string,
  ) {
    this.reason(reason);
    z.number().int().min(0).parse(index);
    return this.locked(token, csrf, client, id, async (sql, actor, e) => {
      await this.plans.onboarding.authorise(sql, actor, e, true);
      const b = await this.block(sql, e, blockId),
        rubric = this.rubric(b);
      requireCondition(
        e.status === 'active' && this.content(b).lessons[index] && (await this.eligible(sql, b)),
        409,
        'quiz_frozen',
        'Quiz must be configured before work or freeze.',
      );
      requireCondition(
        !(await this.quiz(sql, b, index)),
        409,
        'quiz_published',
        'This quiz version is already published.',
      );
      const questions = z
        .array(
          z
            .object({
              prompt: z.string().trim().min(10).max(2000),
              options: z.array(z.string().trim().min(1).max(1000)).min(2).max(4),
              correct: z.number().int().min(0).max(3),
            })
            .strict(),
        )
        .length(rubric.criteria.length)
        .parse(input);
      const answerKey: Record<string, number> = {};
      const publicQuestions = questions.map((q, i) => {
        requireCondition(
          q.options[q.correct] !== undefined,
          422,
          'quiz_answer',
          'The correct answer must be one of the supplied options.',
        );
        answerKey[String(i)] = q.correct;
        return {
          id: String(i),
          prompt: q.prompt,
          options: q.options,
          criterion_id: rubric.criteria[i].id,
        };
      });
      const quizId = randomUUID();
      await sql.query(
        'INSERT INTO objective_quizzes(id,organisation_id,environment,enrolment_id,learning_block_id,lesson_index,questions,answer_key,actor_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [
          quizId,
          client,
          e.environment,
          e.id,
          b.id,
          index,
          encrypt(JSON.stringify(publicQuestions), this.key),
          encrypt(JSON.stringify(answerKey), this.key),
          actor.id,
          reason,
        ],
      );
      await this.enrolments.tenancy.audit(sql, actor, client, 'quiz.published', quizId, reason);
      return { id: quizId };
    });
  }
  async submit(
    token: string,
    csrf: string,
    client: string,
    id: string,
    blockId: string,
    index: number,
    expected: number,
    key: string,
  ) {
    z.uuid().parse(key);
    z.number().int().positive().parse(expected);
    return this.locked(token, csrf, client, id, async (sql, actor, e) => {
      const b = await this.block(sql, e, blockId);
      this.working(actor, e, b, index);
      const existing = (
        await sql.query<Submission>(
          'SELECT * FROM submission_attempts WHERE environment=$1 AND member_id=$2 AND idempotency_key=$3',
          [e.environment, actor.id, key],
        )
      ).rows[0];
      if (existing) {
        requireCondition(
          existing.learning_block_id === b.id &&
            existing.lesson_index === index &&
            existing.draft_version === expected,
          409,
          'submission_idempotency',
          'This request key was used for different work.',
        );
        return this.receiptSummary(existing);
      }
      const draft = await this.draft(sql, b, index, actor.id);
      requireCondition(
        draft && draft.version === expected,
        409,
        'save_required',
        'Save the current draft before submitting.',
      );
      const work = JSON.parse(decrypt(draft.payload, this.key)) as Work;
      requireCondition(
        Boolean(work.body.trim()) || work.files.length > 0 || work.answers.some((a) => a !== null),
        422,
        'work_required',
        'Add your work, quiz answers or clean evidence before submitting.',
      );
      const previous = (
        await sql.query<Submission>(
          'SELECT * FROM submission_attempts WHERE learning_block_id=$1 AND lesson_index=$2 ORDER BY attempt DESC LIMIT 1',
          [b.id, index],
        )
      ).rows[0];
      requireCondition(
        !previous ||
          ['changes_requested', 'withdrawn', 'technical_failure'].includes(previous.status),
        409,
        'submission_pending',
        'The previous attempt is awaiting review or already approved.',
      );
      await this.evidence(sql, actor, e, work.files);
      const quiz = await this.quiz(sql, b, index);
      const payload: SubmissionContent = {
        ...work,
        rubric: this.rubric(b),
        quiz_snapshot: quiz
          ? {
              id: quiz.id,
              questions: JSON.parse(decrypt(quiz.questions, this.key)),
              answer_key: JSON.parse(decrypt(quiz.answer_key, this.key)),
            }
          : null,
      };
      const submission = (
        await sql.query<Submission>(
          "INSERT INTO submission_attempts(id,organisation_id,environment,enrolment_id,learning_block_id,lesson_index,member_id,attempt,status,payload,content_hash,idempotency_key,draft_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'submitted',$9,$10,$11,$12) RETURNING *",
          [
            randomUUID(),
            client,
            e.environment,
            e.id,
            b.id,
            index,
            actor.id,
            (previous?.attempt ?? 0) + 1,
            encrypt(JSON.stringify(payload), this.key),
            digest(JSON.stringify(payload)),
            key,
            expected,
          ],
        )
      ).rows[0];
      await this.enrolments.tenancy.audit(
        sql,
        actor,
        client,
        'submission.submitted',
        submission.id,
        'Submitted immutable lesson attempt ' + submission.attempt,
      );
      const primary = (
        await sql.query<{ user_id: string }>(
          "SELECT cm.user_id FROM coordinator_allocations a JOIN client_memberships cm ON cm.id=a.coordinator_membership_id AND cm.organisation_id=a.organisation_id AND cm.environment=a.environment WHERE a.member_membership_id=$1 AND a.organisation_id=$2 AND a.environment=$3 AND a.kind='primary' AND a.starts_at<=now() AND (a.ends_at IS NULL OR a.ends_at>now()) AND cm.status='active' AND cm.ended_at IS NULL",
          [e.member_membership_id, client, e.environment],
        )
      ).rows[0];
      await this.notice(
        sql,
        e,
        primary?.user_id ?? null,
        'submitted:' + submission.id,
        'review_needed',
      );
      return this.receiptSummary(submission);
    });
  }
  receiptSummary(s: Submission) {
    return {
      id: s.id,
      version: s.version,
      status: s.status,
      attempt: s.attempt,
      contentHash: s.content_hash,
    };
  }
  async withdraw(
    token: string,
    csrf: string,
    client: string,
    id: string,
    submissionId: string,
    expected: number,
    reason: string,
  ) {
    this.reason(reason);
    z.number().int().positive().parse(expected);
    return this.locked(token, csrf, client, id, async (sql, actor, e) => {
      const s = (
        await sql.query<Submission>(
          'SELECT * FROM submission_attempts WHERE id=$1 AND enrolment_id=$2 AND organisation_id=$3 AND environment=$4',
          [submissionId, e.id, client, e.environment],
        )
      ).rows[0];
      requireCondition(
        s && s.member_id === actor.id,
        403,
        'withdraw_forbidden',
        'Only the submitting member can withdraw this attempt.',
      );
      requireCondition(
        s.version === expected &&
          !s.approved_grade_id &&
          !['approved', 'withdrawn'].includes(s.status),
        409,
        'withdraw_conflict',
        'This attempt changed or can no longer be withdrawn.',
      );
      await sql.query(
        "UPDATE submission_attempts SET status='withdrawn',version=version+1,updated_at=now() WHERE id=$1",
        [s.id],
      );
      await this.enrolments.tenancy.audit(sql, actor, client, 'submission.withdrawn', s.id, reason);
      return { id: s.id, version: expected + 1, status: 'withdrawn' };
    });
  }
  async read(token: string, client: string, id: string) {
    return this.db.transaction(async (sql) => {
      const actor = await this.enrolments.context(sql, token, client),
        e = await this.enrolments.record(sql, actor, client, id, 'details'),
        permissions = await this.enrolments.permissions(sql, actor, e);
      const rows = (
        await sql.query<DeliveryBlock>(
          "SELECT * FROM learning_blocks WHERE enrolment_id=$1 AND organisation_id=$2 AND environment=$3 AND state='current' ORDER BY number",
          [e.id, client, e.environment],
        )
      ).rows;
      return {
        enrolment: {
          id: e.id,
          title: e.title,
          status: e.status,
          version: e.version,
          timezone: e.timezone,
        },
        today: this.today(e.timezone),
        memberName:
          (
            await sql.query<{ name: string }>(
              'SELECT name FROM users WHERE id=$1 AND environment=$2',
              [e.member_id, e.environment],
            )
          ).rows[0]?.name ?? 'Member',
        coordinator: permissions.manage,
        member: actor.id === e.member_id,
        blocks: rows.map((b) => ({
          id: b.id,
          number: b.number,
          version: b.version,
          startedAt: b.started_at,
          earlyStart: b.early_start,
          content: this.content(b),
        })),
        submissions: (
          await sql.query(
            'SELECT id,learning_block_id,lesson_index,attempt,version,status,created_at FROM submission_attempts WHERE enrolment_id=$1 AND organisation_id=$2 AND environment=$3 ORDER BY created_at DESC',
            [e.id, client, e.environment],
          )
        ).rows,
      };
    });
  }
  async lesson(token: string, client: string, id: string, blockId: string, index: number) {
    z.number().int().min(0).parse(index);
    return this.db.transaction(async (sql) => {
      const actor = await this.enrolments.context(sql, token, client),
        e = await this.enrolments.record(sql, actor, client, id, 'details'),
        b = await this.block(sql, e, blockId),
        lesson = this.content(b).lessons[index];
      requireCondition(lesson, 404, 'lesson_unavailable', 'This lesson is unavailable.');
      const pinned = (
        await sql.query<OnboardingVersion>(
          'SELECT o.* FROM onboarding_versions o JOIN programme_versions p ON p.onboarding_version_id=o.id AND p.organisation_id=o.organisation_id AND p.environment=o.environment WHERE p.id=$1 AND p.enrolment_id=$2 AND p.organisation_id=$3 AND p.environment=$4',
          [b.programme_version_id, e.id, client, e.environment],
        )
      ).rows[0];
      const resources = pinned ? this.plans.onboarding.data(pinned).resources : null;
      const draft = await this.draft(sql, b, index, actor.id),
        quiz = await this.quiz(sql, b, index),
        coordinator = (await this.enrolments.permissions(sql, actor, e)).manage;
      const candidates = (
        await sql.query<EvidenceFile>(
          "SELECT * FROM evidence_files WHERE enrolment_id=$1 AND organisation_id=$2 AND environment=$3 AND scan_status='clean' ORDER BY created_at DESC",
          [id, client, e.environment],
        )
      ).rows;
      const files = [];
      for (const file of candidates)
        if (await this.files.canRead(sql, actor, file, e))
          files.push({ id: file.id, name: file.original_name });
      return {
        enrolment: { id: e.id, title: e.title, status: e.status, timezone: e.timezone },
        block: {
          id: b.id,
          number: b.number,
          version: b.version,
          state: b.state,
          earlyStart: b.early_start,
        },
        lesson,
        objective: this.content(b).objective,
        prerequisites: this.content(b).prerequisites,
        resources,
        index,
        rubric: this.rubric(b),
        draft: draft
          ? { version: draft.version, ...(JSON.parse(decrypt(draft.payload, this.key)) as Work) }
          : { version: 0, body: '', files: [], answers: [] },
        quiz: quiz
          ? {
              id: quiz.id,
              questions: JSON.parse(decrypt(quiz.questions, this.key)) as QuizQuestion[],
            }
          : null,
        editable:
          actor.id === e.member_id &&
          e.status === 'active' &&
          b.state === 'current' &&
          (b.early_start || lesson.date <= this.today(e.timezone)),
        canConfigureQuiz:
          coordinator && e.status === 'active' && !quiz && (await this.eligible(sql, b)),
        canEarlyStart:
          coordinator && e.status === 'active' && b.state === 'current' && !b.started_at,
        files,
        attempts: (
          await sql.query(
            'SELECT id,attempt,version,status,created_at FROM submission_attempts WHERE learning_block_id=$1 AND lesson_index=$2 ORDER BY attempt DESC',
            [b.id, index],
          )
        ).rows,
      };
    });
  }
  async receipt(token: string, client: string, id: string, submissionId: string) {
    return this.db.transaction(async (sql) => {
      const actor = await this.enrolments.context(sql, token, client),
        e = await this.enrolments.record(sql, actor, client, id, 'details');
      const s = (
        await sql.query<Submission>(
          'SELECT * FROM submission_attempts WHERE id=$1 AND enrolment_id=$2 AND organisation_id=$3 AND environment=$4',
          [submissionId, e.id, client, e.environment],
        )
      ).rows[0];
      requireCondition(s, 404, 'submission_unavailable', 'This submission is unavailable.');
      const data = this.submitted(s);
      return {
        enrolment: { id: e.id, title: e.title },
        submission: {
          ...this.receiptSummary(s),
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
        canWithdraw:
          actor.id === s.member_id &&
          !s.approved_grade_id &&
          !['approved', 'withdrawn'].includes(s.status),
      };
    });
  }
}
