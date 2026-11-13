import { recordNotice } from './notification-records.js';
import { EXTRACTION_ERRORS } from './document-errors.js';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { Sql } from '../../database/src/database.js';
import type { AuthUser } from './auth.js';
import type { Enrolment } from './enrolments.js';
import {
  AssessmentResponses,
  type Assignment,
  type AssessmentSnapshot,
} from './assessment-responses.js';
import { alternateReviewer, openAppeal, type Appeal } from './assessment-access.js';
import type { EvidenceFile } from './evidence-files.js';
import { encrypt, decrypt, digest } from './crypto.js';
import { requireCondition } from './errors.js';
import { scoreAssessment } from './assessment-scoring.js';
import { objective } from './assessment-content.js';
type Attempt = { id: string; assignment_id: string; number: number; snapshot: string };
type Review = {
  id: string;
  attempt_id: string;
  actor_id: string;
  sequence: number;
  kind: string;
  status: string;
  result: string | null;
  source_review_id: string | null;
  reason: string;
  created_at: Date;
};
const reasonSchema = z
  .string()
  .refine(
    (v) => v.trim().length > 0 && [...v].length >= 8 && [...v].length <= 2000,
    'Use a reason between 8 and 2,000 characters.',
  );
export class AssessmentReviews {
  constructor(readonly responses: AssessmentResponses) {}
  get auth() {
    return this.responses.auth;
  }
  get key() {
    return this.responses.key;
  }
  get enrolments() {
    return this.responses.assignments.enrolments;
  }
  async canReview(sql: Sql, actor: AuthUser, a: Assignment, e: Enrolment) {
    if (actor.id === e.member_id) return false;
    if (await openAppeal(sql, a.id)) return alternateReviewer(sql, actor, a.id, e);
    return (await this.enrolments.permissions(sql, actor, e)).manage;
  }
  async reviewer(sql: Sql, actor: AuthUser, a: Assignment, e: Enrolment) {
    requireCondition(
      await this.canReview(sql, actor, a, e),
      403,
      'review_forbidden',
      'Current primary reviewer authority or the authorised alternate appeal reviewer is required.',
    );
  }
  async latest(sql: Sql, a: Assignment) {
    return (
      await sql.query<Attempt>(
        'SELECT id,assignment_id,number,snapshot FROM assessment_attempts WHERE assignment_id=$1 AND organisation_id=$2 AND environment=$3 ORDER BY number DESC LIMIT 1',
        [a.id, a.organisation_id, a.environment],
      )
    ).rows[0];
  }
  async current(sql: Sql, a: Assignment, attempt: string, expected: number) {
    const latest = await this.latest(sql, a);
    requireCondition(
      a.version === expected && latest?.id === attempt,
      409,
      'stale_review',
      'The assessment changed. Reload before reviewing.',
    );
    return latest;
  }
  snapshot(t: Attempt): AssessmentSnapshot {
    return JSON.parse(decrypt(t.snapshot, this.key));
  }
  async evidence(sql: Sql, a: Assignment, t: Attempt) {
    const snapshot = this.snapshot(t),
      items: { id: string; text: string }[] = [];
    for (const q of snapshot.questions) {
      const answer = snapshot.responses[q.id];
      if (q.type === 'open_response' && typeof answer === 'string' && answer.trim())
        items.push({ id: t.id + ':' + q.id, text: answer });
    }
    for (const id of snapshot.files) {
      const file = (
        await sql.query<EvidenceFile>(
          'SELECT * FROM evidence_files WHERE id=$1 AND organisation_id=$2 AND environment=$3 AND enrolment_id=$4',
          [id, a.organisation_id, a.environment, a.enrolment_id],
        )
      ).rows[0];
      const confirmation = (
        await sql.query<{ id: string; source_hash: string; text: string }>(
          'SELECT id,source_hash,text FROM assessment_file_confirmations WHERE attempt_id=$1 AND evidence_file_id=$2 ORDER BY version DESC LIMIT 1',
          [t.id, id],
        )
      ).rows[0];
      if (
        file &&
        confirmation &&
        file.scan_status === 'clean' &&
        file.sha256 === confirmation.source_hash
      ) {
        const bytes = await readFile(this.responses.files.file(file.storage_key)).catch(() => null);
        if (bytes && digest(bytes) === file.sha256)
          items.push({ id: confirmation.id, text: decrypt(confirmation.text, this.key) });
      }
    }
    return items;
  }
  async confirm(
    token: string,
    csrf: string,
    client: string,
    id: string,
    attempt: string,
    expected: number,
    fileId: string,
    text: string,
    reason: string,
  ) {
    reasonSchema.parse(reason);
    z.string()
      .refine(
        (v) => Boolean(v.trim()) && [...v].length <= 30000,
        'Enter verified text up to 30,000 characters.',
      )
      .parse(text);
    return this.responses.locked(token, csrf, client, id, async (sql, actor, a, e) => {
      await this.reviewer(sql, actor, a, e);
      const t = await this.current(sql, a, attempt, expected);
      requireCondition(
        this.snapshot(t).files.includes(fileId),
        422,
        'file_not_submitted',
        'Choose evidence attached to this submitted attempt.',
      );
      const file = (
        await sql.query<EvidenceFile>(
          'SELECT * FROM evidence_files WHERE id=$1 AND organisation_id=$2 AND environment=$3 AND enrolment_id=$4',
          [fileId, client, a.environment, e.id],
        )
      ).rows[0];
      requireCondition(
        file &&
          file.scan_status === 'clean' &&
          (await this.responses.files.canRead(sql, actor, file, e)),
        404,
        'file_unavailable',
        'File is unavailable.',
      );
      const bytes = await readFile(this.responses.files.file(file.storage_key)).catch(() => null);
      requireCondition(
        bytes && digest(bytes) === file.sha256,
        409,
        'file_changed',
        'Source file changed.',
      );
      const confirmation = randomUUID();
      await sql.query(
        'INSERT INTO assessment_file_confirmations(id,organisation_id,environment,attempt_id,evidence_file_id,actor_id,source_hash,version,text,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [
          confirmation,
          client,
          a.environment,
          t.id,
          file.id,
          actor.id,
          file.sha256,
          expected + 1,
          encrypt(text, this.key),
          reason,
        ],
      );
      await sql.query(
        'UPDATE assessment_assignments SET version=version+1,updated_at=now() WHERE id=$1',
        [id],
      );
      await this.enrolments.tenancy.audit(
        sql,
        actor,
        client,
        'assessment.file_confirmed',
        t.id,
        reason,
      );
      return { id, confirmation, version: expected + 1 };
    });
  }
  async decide(
    token: string,
    csrf: string,
    client: string,
    id: string,
    attempt: string,
    expected: number,
    outcome: 'approved' | 'rejected',
    reason: string,
    result: unknown,
    source: string | null = null,
  ) {
    reasonSchema.parse(reason);
    z.enum(['approved', 'rejected']).parse(outcome);
    return this.responses.locked(token, csrf, client, id, async (sql, actor, a, e) => {
      await this.reviewer(sql, actor, a, e);
      const t = await this.current(sql, a, attempt, expected);
      requireCondition(
        ['submitted', 'review_pending', 'technical_failure', 'approved'].includes(a.status),
        409,
        'decision_state',
        'This assessment is not awaiting a decision.',
      );
      requireCondition(
        !(
          await sql.query(
            "SELECT id FROM assessment_reviews WHERE attempt_id=$1 AND status='queued'",
            [t.id],
          )
        ).rowCount,
        409,
        'analysis_pending',
        'Wait for pending analysis before making a decision.',
      );
      if (source)
        requireCondition(
          (
            await sql.query(
              "SELECT id FROM assessment_reviews WHERE id=$1 AND attempt_id=$2 AND status='provisional'",
              [source, t.id],
            )
          ).rowCount,
          409,
          'invalid_source_review',
          'Choose provisional analysis from this attempt.',
        );
      const scored =
        outcome === 'approved'
          ? scoreAssessment(
              this.snapshot(t),
              result,
              (await this.evidence(sql, a, t)).map((item) => item.id),
            )
          : null;
      const review = randomUUID(),
        sequence = Number(
          (
            await sql.query(
              'SELECT coalesce(max(sequence),0)+1 next FROM assessment_reviews WHERE attempt_id=$1',
              [t.id],
            )
          ).rows[0].next,
        );
      await sql.query(
        "INSERT INTO assessment_reviews(id,organisation_id,environment,assignment_id,attempt_id,actor_id,sequence,kind,status,result,source_review_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7,'decision',$8,$9,$10,$11)",
        [
          review,
          client,
          a.environment,
          id,
          t.id,
          actor.id,
          sequence,
          outcome,
          scored ? encrypt(JSON.stringify(scored), this.key) : null,
          source,
          reason,
        ],
      );
      await sql.query(
        'UPDATE assessment_assignments SET status=$1,version=version+1,approved_review_id=$2,updated_at=now() WHERE id=$3',
        [outcome, outcome === 'approved' ? review : null, id],
      );
      await sql.query(
        "UPDATE assessment_appeals SET status='resolved',resolution=$1,updated_at=now() WHERE assignment_id=$2 AND status='open'",
        [reason, id],
      );
      await this.enrolments.tenancy.audit(
        sql,
        actor,
        client,
        'assessment.' + outcome,
        review,
        reason,
      );
      await recordNotice(
        sql,
        e,
        e.member_id,
        'assessment-decision:' + review,
        'assessment_decided',
      );
      return { id, review, version: expected + 1, status: outcome };
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
    reasonSchema.parse(reason);
    return this.responses.locked(token, csrf, client, id, async (sql, actor, a, e) => {
      requireCondition(
        actor.id === e.member_id,
        403,
        'member_required',
        'Only the assigned member can request an appeal.',
      );
      requireCondition(
        a.version === expected &&
          ['approved', 'rejected'].includes(a.status) &&
          !(await openAppeal(sql, id)),
        409,
        'appeal_state',
        'The decision changed or an appeal is already open.',
      );
      const t = await this.latest(sql, a);
      const decision =
        t &&
        (
          await sql.query<Review>(
            "SELECT * FROM assessment_reviews WHERE attempt_id=$1 AND kind='decision' ORDER BY sequence DESC LIMIT 1",
            [t.id],
          )
        ).rows[0];
      requireCondition(decision, 409, 'decision_required', 'A recorded decision is required.');
      const appeal = randomUUID();
      await sql.query(
        'INSERT INTO assessment_appeals(id,organisation_id,environment,assignment_id,review_id,reason) VALUES($1,$2,$3,$4,$5,$6)',
        [appeal, client, a.environment, id, decision.id, reason],
      );
      await sql.query(
        'UPDATE assessment_assignments SET version=version+1,updated_at=now() WHERE id=$1',
        [id],
      );
      await this.enrolments.tenancy.audit(
        sql,
        actor,
        client,
        'assessment.appealed',
        appeal,
        'Member requested alternate review',
      );
      return { id, appeal, version: expected + 1 };
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
    reasonSchema.parse(reason);
    return this.auth.db.transaction(async (sql) => {
      await sql.query('SELECT id FROM organisations WHERE id=$1 FOR UPDATE', [client]);
      const actor = await this.enrolments.context(sql, token, client, csrf);
      requireCondition(
        await this.enrolments.access.role(sql, actor.id, client, actor.environment, 'admin'),
        403,
        'client_admin_required',
        'Client Admin authority is required.',
      );
      const p = (
        await sql.query<Appeal>(
          'SELECT * FROM assessment_appeals WHERE id=$1 AND organisation_id=$2 AND environment=$3 FOR UPDATE',
          [id, client, actor.environment],
        )
      ).rows[0];
      requireCondition(
        p && p.status === 'open',
        404,
        'appeal_unavailable',
        'This open appeal is unavailable.',
      );
      const e = (
        await sql.query<Enrolment>(
          'SELECT e.* FROM enrolments e JOIN assessment_assignments a ON a.enrolment_id=e.id WHERE a.id=$1 AND a.organisation_id=$2 AND a.environment=$3',
          [p.assignment_id, client, actor.environment],
        )
      ).rows[0];
      const prior = (
        await sql.query<Review>('SELECT * FROM assessment_reviews WHERE id=$1', [p.review_id])
      ).rows[0];
      const member = await this.enrolments.access.membership(
        sql,
        reviewer,
        client,
        actor.environment,
      );
      requireCondition(
        e.group_id &&
          member &&
          ![actor.id, e.member_id, prior.actor_id].includes(reviewer) &&
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
      await sql.query(
        'UPDATE assessment_appeals SET reviewer_id=$1,role_assignment_id=$2,updated_at=now() WHERE id=$3',
        [reviewer, role.id, id],
      );
      await this.enrolments.tenancy.audit(
        sql,
        actor,
        client,
        'assessment.appeal_assigned',
        id,
        reason,
      );
      return { id, reviewer };
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
    reasonSchema.parse(reason);
    return this.responses.locked(token, csrf, client, id, async (sql, actor, a, e) => {
      await this.reviewer(sql, actor, a, e);
      requireCondition(
        a.version === expected && (await alternateReviewer(sql, actor, id, e)),
        409,
        'stale_appeal',
        'The appeal changed. Reload before resolving it.',
      );
      const p = (await openAppeal(sql, id))!;
      await sql.query(
        "UPDATE assessment_appeals SET status='resolved',resolution=$1,updated_at=now() WHERE id=$2",
        [reason, p.id],
      );
      await sql.query(
        'UPDATE assessment_assignments SET version=version+1,updated_at=now() WHERE id=$1',
        [id],
      );
      await this.enrolments.tenancy.audit(
        sql,
        actor,
        client,
        'assessment.appeal_upheld',
        p.id,
        reason,
      );
      return { id, version: expected + 1 };
    });
  }
  async routing(token: string, client: string) {
    return this.auth.db.transaction(async (sql) => {
      const actor = await this.enrolments.context(sql, token, client);
      const canRoute = await this.enrolments.access.role(
        sql,
        actor.id,
        client,
        actor.environment,
        'admin',
      );
      if (!canRoute) return { canRoute: false, appeals: [] };
      const rows = (
        await sql.query<
          Appeal & { group_id: string | null; member_id: string; prior_actor: string }
        >(
          "SELECT p.*,e.group_id,e.member_id,r.actor_id prior_actor FROM assessment_appeals p JOIN assessment_assignments a ON a.id=p.assignment_id JOIN enrolments e ON e.id=a.enrolment_id JOIN assessment_reviews r ON r.id=p.review_id WHERE p.organisation_id=$1 AND p.environment=$2 AND p.status='open' ORDER BY p.created_at,p.id",
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
        // Routing metadata intentionally contains no response, score or private appeal reason.
        appeals.push({
          id: row.id,
          assignmentId: row.assignment_id,
          reviewerId: row.reviewer_id,
          reviewers,
        });
      }
      return { canRoute: true, appeals };
    });
  }
  async read(token: string, client: string, id: string) {
    return this.auth.db.transaction(async (sql) => {
      const actor = await this.enrolments.context(sql, token, client),
        { assignment: a, enrolment: e } = await this.responses.record(sql, actor, client, id),
        member = actor.id === e.member_id;
      const t = await this.latest(sql, a),
        p = await openAppeal(sql, id),
        canReview = await this.canReview(sql, actor, a, e);
      const approvedRow = a.approved_review_id
        ? (
            await sql.query<Review>(
              "SELECT * FROM assessment_reviews WHERE id=$1 AND assignment_id=$2 AND status='approved'",
              [a.approved_review_id, id],
            )
          ).rows[0]
        : null;
      const definition = await this.responses.definition(sql, a);
      const approved = approvedRow
        ? {
            contract: 'C03-v1',
            assignment_id: id,
            attempt_id: approvedRow.attempt_id,
            decision_id: approvedRow.id,
            definition_id: a.definition_id,
            revision: definition.revision,
            approved_at: approvedRow.created_at,
            result: JSON.parse(decrypt(approvedRow.result!, this.key)),
            plan_creation_available: false,
            criterionLabels: Object.fromEntries(
              definition.rubric.criteria.map((c) => [c.id, c.label]),
            ),
          }
        : null;
      const reviews =
        canReview && t
          ? (
              await sql.query<Review>(
                'SELECT * FROM assessment_reviews WHERE attempt_id=$1 ORDER BY sequence DESC',
                [t.id],
              )
            ).rows.map((r) => ({
              id: r.id,
              kind: r.kind,
              status: r.status,
              result: r.result ? JSON.parse(decrypt(r.result, this.key)) : null,
              reason: r.reason,
              createdAt: r.created_at,
            }))
          : [];
      const files: {
        id: string;
        name: string;
        status: string;
        extraction: {
          id: string;
          status: string;
          version: number;
          text: string | null;
          error: string | null;
          warnings: string[];
          engine: string | null;
          pages: number | null;
        } | null;
      }[] = [];
      if (canReview && t)
        for (const id of this.snapshot(t).files) {
          const file = (
            await sql.query<EvidenceFile>(
              'SELECT * FROM evidence_files WHERE id=$1 AND organisation_id=$2 AND environment=$3 AND enrolment_id=$4',
              [id, client, a.environment, e.id],
            )
          ).rows[0];
          if (file && (await this.responses.files.canRead(sql, actor, file, e))) {
            const extraction = (
              await sql.query<{
                id: string;
                status: string;
                version: number;
                source_hash: string;
                extracted_text: string | null;
                error_code: string | null;
                warnings: string[];
                engine: string | null;
                page_count: number | null;
              }>(
                'SELECT id,status,version,source_hash,extracted_text,error_code,warnings,engine,page_count FROM document_extractions WHERE evidence_file_id=$1 AND assessment_attempt_id=$2 AND organisation_id=$3 AND environment=$4 ORDER BY attempt DESC LIMIT 1',
                [file.id, t.id, client, a.environment],
              )
            ).rows[0];
            files.push({
              id: file.id,
              name: file.original_name,
              status: file.scan_status,
              extraction: extraction
                ? {
                    id: extraction.id,
                    status: extraction.status,
                    version: extraction.version,
                    text:
                      extraction.status === 'ready' &&
                      file.scan_status === 'clean' &&
                      extraction.source_hash === file.sha256 &&
                      extraction.extracted_text
                        ? decrypt(extraction.extracted_text, this.key)
                        : null,
                    error: extraction.error_code
                      ? (EXTRACTION_ERRORS[extraction.error_code] ??
                        EXTRACTION_ERRORS.parser_failed)
                      : null,
                    warnings: extraction.warnings ?? [],
                    engine: extraction.engine,
                    pages: extraction.page_count,
                  }
                : null,
            });
          }
        }
      return {
        files,
        version: a.version,
        status: a.status,
        canAnalyze: Boolean(
          canReview &&
          t &&
          a.environment === 'test' &&
          process.env.NODE_ENV !== 'production' &&
          this.snapshot(t).questions.some((q) => q.type === 'open_response') &&
          (
            await sql.query(
              'SELECT id FROM users WHERE id=$1 AND environment=$2 AND is_synthetic=true',
              [e.member_id, e.environment],
            )
          ).rowCount,
        ),
        member,
        canReview,
        attemptId: t?.id ?? null,
        appeal: p
          ? { id: p.id, status: p.status, reason: p.reason, assigned: Boolean(p.reviewer_id) }
          : null,
        approved,
        reviews,
        rubric: canReview && t ? this.snapshot(t).rubric : null,
        definitionId: a.definition_id,
        revision: definition.revision,
        objective: canReview && t ? objective(this.snapshot(t)) : null,
        rubricApplicable:
          canReview && t
            ? this.snapshot(t).questions.some((q) => q.type === 'open_response')
            : false,
        evidence: canReview && t ? await this.evidence(sql, a, t) : [],
      };
    });
  }
}
