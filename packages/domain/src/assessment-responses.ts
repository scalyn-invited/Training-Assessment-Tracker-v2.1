import { recordNotice, primaryRecipient } from './notification-records.js';
import { randomUUID } from 'node:crypto';
import { alternateReviewer, openAppeal } from './assessment-access.js';
import { z } from 'zod';
import type { Sql } from '../../database/src/database.js';
import type { AuthUser } from './auth.js';
import type { Enrolment } from './enrolments.js';
import { AssessmentAssignments } from './assessment-assignments.js';
import { EvidenceFiles, type EvidenceFile } from './evidence-files.js';
import { encrypt, decrypt, digest } from './crypto.js';
import { DomainError, requireCondition } from './errors.js';
import {
  matrixResponse,
  requiredMatrixErrors,
  type AssessmentDraft,
} from './assessment-content.js';
export type ResponseDraft = {
  responses: Record<string, unknown>;
  context: string | null;
  files: string[];
  progress?: { current: string; furthest: string };
  _save_receipt?: { token: string; hash: string };
};
export type AssessmentSnapshot = Omit<ResponseDraft, '_save_receipt'> &
  AssessmentDraft & { definition_id: string; revision: number; objective_policy: string };
export type Assignment = {
  id: string;
  organisation_id: string;
  environment: 'test' | 'production';
  definition_id: string;
  enrolment_id: string;
  version: number;
  status: string;
  draft: string | null;
  approved_review_id: string | null;
};
type Definition = Omit<AssessmentDraft, 'answer_key'> & {
  id: string;
  revision: number;
  answer_key: string;
};
type Attempt = {
  id: string;
  assignment_id: string;
  number: number;
  draft_version: number;
  snapshot: string;
  content_hash: string;
  created_at: Date;
};
const inputSchema = z.object({
  responses: z.record(z.string(), z.unknown()).refine((r) => Object.keys(r).length <= 30),
  context: z.string().max(6000).nullable().optional(),
  files: z
    .array(z.uuid())
    .max(5)
    .refine((ids) => new Set(ids).size === ids.length)
    .optional(),
  section_id: z.uuid().optional(),
  navigate_to: z.uuid().nullable().optional(),
  save_token: z.uuid().optional(),
});
export class AssessmentResponses {
  readonly files: EvidenceFiles;
  constructor(
    readonly assignments: AssessmentAssignments,
    files?: EvidenceFiles,
  ) {
    this.files =
      files ??
      new EvidenceFiles(assignments.enrolments, undefined, undefined, assignments.definitions.key);
  }
  get auth() {
    return this.assignments.definitions.auth;
  }
  get key() {
    return this.assignments.definitions.key;
  }
  async record(sql: Sql, actor: AuthUser, client: string, id: string) {
    const assignment = (
      await sql.query<Assignment>(
        'SELECT * FROM assessment_assignments WHERE id=$1 AND organisation_id=$2 AND environment=$3',
        [id, client, actor.environment],
      )
    ).rows[0];
    requireCondition(
      assignment,
      404,
      'assessment_unavailable',
      'This assigned assessment is unavailable.',
    );
    const enrolment = (
      await sql.query<Enrolment>(
        'SELECT * FROM enrolments WHERE id=$1 AND organisation_id=$2 AND environment=$3',
        [assignment.enrolment_id, client, actor.environment],
      )
    ).rows[0];
    requireCondition(
      enrolment &&
        ((await this.assignments.enrolments.permissions(sql, actor, enrolment)).details ||
          (await alternateReviewer(sql, actor, id, enrolment))),
      404,
      'assessment_unavailable',
      'This assigned assessment is unavailable.',
    );
    return { assignment, enrolment };
  }
  async locked<T>(
    token: string,
    csrf: string,
    client: string,
    id: string,
    work: (sql: Sql, actor: AuthUser, a: Assignment, e: Enrolment) => Promise<T>,
  ) {
    return this.auth.db.transaction(async (sql) => {
      await sql.query('SELECT id FROM organisations WHERE id=$1 FOR UPDATE', [client]);
      const actor = await this.assignments.enrolments.context(sql, token, client, csrf);
      const { assignment, enrolment } = await this.record(sql, actor, client, id);
      await sql.query('SELECT id FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [
        [actor.id, enrolment.member_id],
      ]);
      await sql.query('SELECT id FROM assessment_assignments WHERE id=$1 FOR UPDATE', [
        assignment.id,
      ]);
      return work(sql, actor, assignment, enrolment);
    });
  }
  async definition(sql: Sql, a: Assignment) {
    return (
      await sql.query<Definition>(
        'SELECT id,revision,title,questions,sections,rubric,answer_key FROM assessment_definitions WHERE id=$1 AND organisation_id=$2 AND environment=$3',
        [a.definition_id, a.organisation_id, a.environment],
      )
    ).rows[0];
  }
  draft(a: Assignment): ResponseDraft {
    return a.draft
      ? JSON.parse(decrypt(a.draft, this.key))
      : { responses: {}, context: null, files: [] };
  }
  snapshot(t: Attempt): AssessmentSnapshot {
    return JSON.parse(decrypt(t.snapshot, this.key));
  }
  async read(token: string, client: string, id: string) {
    return this.auth.db.transaction(async (sql) => {
      const actor = await this.assignments.enrolments.context(sql, token, client),
        { assignment: a, enrolment: e } = await this.record(sql, actor, client, id);
      const definition = await this.definition(sql, a),
        own = actor.id === e.member_id,
        permissions = await this.assignments.enrolments.permissions(sql, actor, e);
      const attempts = (
        await sql.query<Attempt>(
          'SELECT * FROM assessment_attempts WHERE assignment_id=$1 AND organisation_id=$2 AND environment=$3 ORDER BY number DESC',
          [id, client, actor.environment],
        )
      ).rows.map((t) => {
        const snapshot = this.snapshot(t);
        return {
          id: t.id,
          number: t.number,
          createdAt: t.created_at,
          contentHash: t.content_hash,
          questions: snapshot.questions,
          sections: snapshot.sections,
          responses: snapshot.responses,
          context: snapshot.context,
          files: snapshot.files,
        };
      });
      const saved = this.draft(a);
      return {
        id: a.id,
        enrolmentId: e.id,
        title: definition.title,
        memberName: (
          await sql.query<{ name: string }>(
            'SELECT name FROM users WHERE id=$1 AND environment=$2',
            [e.member_id, e.environment],
          )
        ).rows[0].name,
        revision: definition.revision,
        version: a.version,
        status: a.status,
        member: own,
        canReview:
          !own &&
          ((await openAppeal(sql, id))
            ? await alternateReviewer(sql, actor, id, e)
            : permissions.manage),
        appealOpen: Boolean(await openAppeal(sql, id)),
        definition: { questions: definition.questions, sections: definition.sections },
        draft: own
          ? {
              responses: saved.responses,
              context: saved.context,
              files: saved.files,
              progress: saved.progress,
            }
          : null,
        attempts,
      };
    });
  }
  async validateFiles(sql: Sql, actor: AuthUser, a: Assignment, ids: string[]) {
    for (const id of ids) {
      const file = (
        await sql.query<EvidenceFile>(
          'SELECT * FROM evidence_files WHERE id=$1 AND organisation_id=$2 AND environment=$3 AND enrolment_id=$4',
          [id, a.organisation_id, a.environment, a.enrolment_id],
        )
      ).rows[0];
      requireCondition(
        file && file.scan_status === 'clean' && (await this.files.canRead(sql, actor, file)),
        422,
        'invalid_evidence',
        'Use accessible, scanned files from this member record.',
      );
    }
    return ids;
  }
  async save(
    token: string,
    csrf: string,
    client: string,
    id: string,
    expected: number,
    input: unknown,
  ) {
    const data = inputSchema.parse(input);
    requireCondition(
      Number.isInteger(expected) && expected >= 1,
      422,
      'invalid_version',
      'Use the current draft version.',
    );
    return this.locked(token, csrf, client, id, async (sql, actor, a, e) => {
      requireCondition(
        !(await openAppeal(sql, id)),
        409,
        'appeal_open',
        'An open appeal must be resolved before editing or resubmitting.',
      );

      requireCondition(
        actor.id === e.member_id,
        403,
        'member_required',
        'Only the assigned member can edit their response.',
      );
      const definition = await this.definition(sql, a),
        old = this.draft(a),
        hash = digest(JSON.stringify([expected, data]));
      if (data.save_token && old._save_receipt?.token === data.save_token) {
        requireCondition(
          a.version === expected + 1 &&
            ['draft', 'rejected'].includes(a.status) &&
            old._save_receipt.hash === hash,
          409,
          'save_conflict',
          'This save changed. Copy your answers before reloading.',
        );
        return { id, version: a.version, status: a.status, progress: old.progress ?? null };
      }
      requireCondition(
        a.version === expected && ['assigned', 'draft', 'rejected'].includes(a.status),
        409,
        'stale_response',
        'Draft changed or has already been submitted. Copy your answers before reloading.',
      );
      let progress: ResponseDraft['progress'];
      if (definition.sections !== null) {
        const sections = definition.sections,
          ids = sections.map((s) => s.id),
          current = old.progress?.current ?? ids[0],
          furthest = old.progress?.furthest ?? ids[0];

        requireCondition(
          data.save_token && data.section_id,
          422,
          'section_required',
          'Supply the current section and a save reference.',
        );
        requireCondition(
          data.section_id === current,
          409,
          'section_changed',
          'Your current section changed. Copy your answers before reloading.',
        );
        const index = ids.indexOf(current),
          target = data.navigate_to ?? current,
          next = ids.indexOf(target),
          reached = ids.indexOf(furthest);
        requireCondition(
          Object.keys(data.responses).every((key) => sections[index].question_ids.includes(key)),
          422,
          'wrong_section',
          'Save answers for the current section only.',
        );
        requireCondition(
          next >= 0 && (next <= reached || next === index + 1),
          422,
          'section_order',
          'Continue through the sections in order.',
        );
        progress = { current: target, furthest: ids[Math.max(reached, next)] };
      }
      const responses =
        definition.sections !== null
          ? Object.assign(Object.create(null), old.responses, data.responses)
          : Object.assign(Object.create(null), data.responses);
      const known = new Set(definition.questions.map((q) => q.id));
      requireCondition(
        Object.keys(responses).every((key) => known.has(key)),
        422,
        'unknown_question',
        'Use questions from the assigned assessment revision.',
      );
      for (const q of definition.questions) {
        const answer = Object.hasOwn(responses, q.id) ? responses[q.id] : null;
        if (q.type === 'self_assessment') responses[q.id] = matrixResponse(q, answer ?? {});
        else {
          requireCondition(
            answer === null || (typeof answer === 'string' && [...answer].length <= 10000),
            422,
            'invalid_response',
            'Use a response up to 10,000 characters.',
          );
          if (q.type === 'multiple_choice' && answer !== null && answer !== '')
            requireCondition(
              q.choices.some((c) => c.id === answer),
              422,
              'invalid_choice',
              'Choose an answer from the assigned revision.',
            );
        }
      }
      const files = await this.validateFiles(
        sql,
        actor,
        a,
        data.files ?? (definition.sections !== null ? old.files : []),
      );
      const saved: ResponseDraft = {
        responses,
        files,
        context:
          data.context === undefined
            ? definition.sections !== null
              ? old.context
              : null
            : data.context,
      };
      if (progress) {
        saved.progress = progress;
        const current = old.progress?.current ?? definition.sections![0].id,
          ids = definition.sections!.map((s) => s.id);
        if (ids.indexOf(progress.current) > ids.indexOf(current)) {
          const group = definition.sections!.find((s) => s.id === current)!;
          const errors = requiredMatrixErrors(
            definition.questions.filter((q) => group.question_ids.includes(q.id)),
            responses,
          );
          if (Object.keys(errors).length)
            throw new DomainError(
              422,
              'required_matrix',
              'Choose a rating for every required assessment area before continuing.',
              errors,
            );
        }
      }
      if (data.save_token) saved._save_receipt = { token: data.save_token, hash };
      await sql.query(
        "UPDATE assessment_assignments SET draft=$1,version=version+1,status='draft',updated_at=now() WHERE id=$2",
        [encrypt(JSON.stringify(saved), this.key), id],
      );
      return { id, version: expected + 1, status: 'draft', progress: progress ?? null };
    });
  }
  async submit(
    token: string,
    csrf: string,
    client: string,
    id: string,
    expected: number,
    key: string,
  ) {
    z.uuid().parse(key);
    return this.locked(token, csrf, client, id, async (sql, actor, a, e) => {
      requireCondition(
        !(await openAppeal(sql, id)),
        409,
        'appeal_open',
        'An open appeal must be resolved before editing or resubmitting.',
      );

      requireCondition(
        actor.id === e.member_id,
        403,
        'member_required',
        'Only the assigned member can submit their response.',
      );
      const previous = (
        await sql.query<Attempt>(
          'SELECT * FROM assessment_attempts WHERE environment=$1 AND idempotency_key=$2',
          [a.environment, key],
        )
      ).rows[0];
      if (previous) {
        requireCondition(
          previous.assignment_id === id && previous.draft_version === expected,
          409,
          'submission_conflict',
          'This submission reference belongs to different saved work.',
        );
        return {
          id,
          receipt: previous.id,
          number: previous.number,
          version: a.version,
          status: a.status,
        };
      }
      requireCondition(
        a.version === expected && a.status === 'draft' && a.draft,
        409,
        'save_required',
        'Save your current response before submitting.',
      );
      const data = this.draft(a),
        definition = await this.definition(sql, a);
      if (definition.sections !== null)
        requireCondition(
          data.progress?.current === definition.sections.at(-1)?.id,
          422,
          'final_section_required',
          'Continue to the final section before submitting.',
        );
      data.files = await this.validateFiles(sql, actor, a, data.files);
      const errors = requiredMatrixErrors(definition.questions, data.responses);
      if (Object.keys(errors).length)
        throw new DomainError(
          422,
          'required_matrix',
          'Choose a rating for every required assessment area before submitting.',
          errors,
        );
      const selfOnly = definition.questions.every((q) => q.type === 'self_assessment'),
        choices = definition.questions.some((q) => q.type === 'multiple_choice');
      requireCondition(
        selfOnly ||
          choices ||
          Object.values(data.responses).some((v) => typeof v === 'string' && v.trim()) ||
          data.files.length,
        422,
        'response_required',
        'Add a written response or scanned evidence.',
      );
      delete data._save_receipt;
      const snapshot: AssessmentSnapshot = {
        ...data,
        title: definition.title,
        sections: definition.sections,
        definition_id: definition.id,
        revision: definition.revision,
        questions: definition.questions,
        rubric: definition.rubric,
        answer_key: JSON.parse(decrypt(definition.answer_key, this.key)),
        objective_policy: 'equal-weight-v1',
      };
      const receipt = randomUUID(),
        number = (
          await sql.query(
            'SELECT coalesce(max(number),0)+1 number FROM assessment_attempts WHERE assignment_id=$1',
            [id],
          )
        ).rows[0].number;
      const encoded = JSON.stringify(snapshot);
      await sql.query(
        'INSERT INTO assessment_attempts(id,organisation_id,environment,assignment_id,number,draft_version,idempotency_key,snapshot,content_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [
          receipt,
          client,
          a.environment,
          id,
          number,
          expected,
          key,
          encrypt(encoded, this.key),
          digest(encoded),
        ],
      );
      await sql.query(
        "UPDATE assessment_assignments SET version=version+1,status='submitted',updated_at=now() WHERE id=$1",
        [id],
      );
      await this.assignments.definitions.audit(sql, actor, client, 'assessment.submitted', receipt);
      await recordNotice(
        sql,
        e,
        await primaryRecipient(sql, e),
        'assessment-submitted:' + receipt,
        'assessment_review',
      );
      return { id, receipt, number, version: expected + 1, status: 'submitted' };
    });
  }
}
