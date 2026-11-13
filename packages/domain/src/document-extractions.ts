import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { Sql } from '../../database/src/database.js';
import { privatePath } from '../../database/src/config.js';
import type { AuthUser } from './auth.js';
import type { Enrolment } from './enrolments.js';
import type { EvidenceFile } from './evidence-files.js';
import type { Assignment } from './assessment-responses.js';
import type { AssessmentReviews } from './assessment-reviews.js';
import { encrypt, decrypt, digest } from './crypto.js';
import { enqueue, type Job } from './outbox.js';
import { requireCondition } from './errors.js';
import { runDocument, type DocumentRunner } from './document-runner.js';
import { EXTRACTION_ERRORS } from './document-errors.js';
export type Extraction = {
  id: string;
  organisation_id: string;
  environment: 'test' | 'production';
  enrolment_id: string;
  evidence_file_id: string;
  actor_id: string;
  assessment_assignment_id: string | null;
  assessment_attempt_id: string | null;
  attempt: number;
  version: number;
  status: string;
  source_hash: string;
  lease: string | null;
  started_at: Date | null;
  dispatch_seq: number;
  error_code: string | null;
  extracted_text: string | null;
  engine: string | null;
  page_count: number | null;
  warnings: string[] | null;
};
export class DocumentExtractions {
  constructor(
    readonly reviews: AssessmentReviews,
    readonly runner: DocumentRunner = runDocument,
    readonly directory = path.join(privatePath(), 'extraction-work'),
  ) {}
  get db() {
    return this.reviews.auth.db;
  }
  get files() {
    return this.reviews.responses.files;
  }
  async requestAssessment(
    token: string,
    csrf: string,
    client: string,
    assignment: string,
    attempt: string,
    expected: number,
    fileId: string,
  ) {
    return this.reviews.responses.locked(
      token,
      csrf,
      client,
      assignment,
      async (sql, actor, a, e) => {
        await this.reviews.reviewer(sql, actor, a, e);
        const t = await this.reviews.current(sql, a, attempt, expected);
        const file = (
          await sql.query<EvidenceFile>(
            'SELECT * FROM evidence_files WHERE id=$1 AND organisation_id=$2 AND environment=$3 AND enrolment_id=$4 FOR UPDATE',
            [fileId, client, actor.environment, e.id],
          )
        ).rows[0];
        requireCondition(
          file &&
            file.scan_status === 'clean' &&
            this.reviews.snapshot(t).files.includes(fileId) &&
            (await this.files.canRead(sql, actor, file, e)),
          422,
          'extraction_file',
          'Choose a clean file attached to this submitted attempt.',
        );
        return this.admit(sql, actor, e, file, a.id, t.id);
      },
    );
  }
  async admit(
    sql: Sql,
    actor: AuthUser,
    e: Enrolment,
    file: EvidenceFile,
    assignment: string | null,
    attempt: string | null,
  ) {
    const latest = (
      await sql.query<Extraction>(
        'SELECT * FROM document_extractions WHERE evidence_file_id=$1 ORDER BY attempt DESC LIMIT 1',
        [file.id],
      )
    ).rows[0];
    if (latest && latest.assessment_attempt_id === attempt && latest.status !== 'failed')
      return { id: latest.id, status: latest.status, version: latest.version };
    const run = (
      await sql.query<Extraction>(
        'INSERT INTO document_extractions(id,organisation_id,environment,enrolment_id,evidence_file_id,actor_id,assessment_assignment_id,assessment_attempt_id,attempt,status,source_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
        [
          randomUUID(),
          e.organisation_id,
          e.environment,
          e.id,
          file.id,
          actor.id,
          assignment,
          attempt,
          (latest?.attempt ?? 0) + 1,
          file.scan_status === 'clean' ? 'queued' : 'waiting_scan',
          file.sha256,
        ],
      )
    ).rows[0];
    await this.dispatch(sql, run);
    await this.reviews.enrolments.tenancy.audit(
      sql,
      actor,
      e.organisation_id,
      'extraction.requested',
      run.id,
      'Requested private document extraction',
    );
    return { id: run.id, status: run.status, version: run.version };
  }
  async dispatch(sql: Sql, run: Extraction) {
    const generation = run.dispatch_seq + 1;
    await enqueue(
      sql,
      { organisationId: run.organisation_id, environment: run.environment, actorId: run.actor_id },
      'document.extract',
      'extract:' + run.id + ':' + generation,
      { id: run.id, generation },
    );
    await sql.query(
      'UPDATE document_extractions SET dispatch_seq=$1,updated_at=now() WHERE id=$2',
      [generation, run.id],
    );
  }
  async locked(sql: Sql, id: string) {
    const ref = (
      await sql.query<Extraction>('SELECT * FROM document_extractions WHERE id=$1', [id])
    ).rows[0];
    if (!ref) return null;
    await sql.query('SELECT id FROM organisations WHERE id=$1 FOR UPDATE', [ref.organisation_id]);
    const e = (
      await sql.query<Enrolment>(
        'SELECT * FROM enrolments WHERE id=$1 AND organisation_id=$2 AND environment=$3',
        [ref.enrolment_id, ref.organisation_id, ref.environment],
      )
    ).rows[0];
    if (!e) return null;
    await sql.query('SELECT id FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [
      [e.member_id, ref.actor_id],
    ]);
    const file = (
      await sql.query<EvidenceFile>('SELECT * FROM evidence_files WHERE id=$1 FOR UPDATE', [
        ref.evidence_file_id,
      ])
    ).rows[0];
    const run = (
      await sql.query<Extraction>('SELECT * FROM document_extractions WHERE id=$1 FOR UPDATE', [id])
    ).rows[0];
    return { run, file, e };
  }
  async authorize(sql: Sql, run: Extraction, file: EvidenceFile, e: Enrolment) {
    const actor = (
      await sql.query<AuthUser>(
        'SELECT id,name,email,global_admin,permission_version,environment FROM users WHERE id=$1 AND environment=$2',
        [run.actor_id, run.environment],
      )
    ).rows[0];
    requireCondition(
      actor &&
        (await this.reviews.enrolments.access.active(sql, actor.id, actor.environment)) &&
        (await this.reviews.enrolments.access.available(sql, e.organisation_id, e.environment)),
      403,
      'access_revoked',
      'Extraction access changed.',
    );
    if (run.assessment_assignment_id) {
      const a = (
        await sql.query<Assignment>(
          'SELECT * FROM assessment_assignments WHERE id=$1 AND organisation_id=$2 AND environment=$3',
          [run.assessment_assignment_id, run.organisation_id, run.environment],
        )
      ).rows[0];
      requireCondition(
        a && a.enrolment_id === e.id,
        404,
        'access_revoked',
        'Assessment unavailable.',
      );
      await this.reviews.reviewer(sql, actor, a, e);
      const t = await this.reviews.latest(sql, a);
      requireCondition(
        t && t.id === run.assessment_attempt_id && this.reviews.snapshot(t).files.includes(file.id),
        409,
        'access_revoked',
        'The submitted attempt changed.',
      );
    } else {
      requireCondition(
        ['onboarding', 'ready'].includes(e.status) &&
          file.purpose === 'assessment' &&
          (await this.reviews.enrolments.permissions(sql, actor, e)).manage,
        403,
        'access_revoked',
        'Current coordinator access is required.',
      );
    }
    requireCondition(
      await this.files.canRead(sql, actor, file, e),
      404,
      'access_revoked',
      'File unavailable.',
    );
    return actor;
  }
  async intact(run: Extraction, file: EvidenceFile) {
    if (file.scan_status !== 'clean' || file.sha256 !== run.source_hash) return null;
    const target = this.files.file(file.storage_key),
      info = await stat(target).catch(() => null);
    if (!info?.isFile() || info.size > 20 * 1024 * 1024) return null;
    const bytes = await readFile(target).catch(() => null);
    return bytes && digest(bytes) === run.source_hash ? bytes : null;
  }
  workdir(lease: string) {
    z.uuid().parse(lease);
    const root = path.resolve(this.directory),
      target = path.resolve(root, lease);
    requireCondition(
      path.dirname(target) === root,
      500,
      'work_directory',
      'Invalid work directory.',
    );
    return target;
  }
  async cleanup(lease: string | null) {
    if (lease) await rm(this.workdir(lease), { recursive: true, force: true });
  }
  async lease(sql: Sql, job: Job) {
    return Boolean(
      (
        await sql.query(
          "SELECT id FROM outbox_events WHERE id=$1 AND organisation_id=$2 AND environment=$3 AND lease_token=$4 AND status='processing' AND lease_until>now()",
          [job.id, job.organisation_id, job.environment, job.lease_token],
        )
      ).rowCount,
    );
  }
  async fail(sql: Sql, run: Extraction, error: string) {
    const code = EXTRACTION_ERRORS[error] ? error : 'parser_failed';
    await sql.query(
      "UPDATE document_extractions SET status='failed',error_code=$1,extracted_text=NULL,review_data=NULL,version=version+1,updated_at=now() WHERE id=$2",
      [code, run.id],
    );
  }
  async process(job: Job) {
    requireCondition(
      job.environment === (process.env.NODE_ENV === 'production' ? 'production' : 'test'),
      403,
      'environment_mismatch',
      'Cannot process another environment.',
    );
    const id = z.uuid().parse(job.payload.id);
    const claimed = await this.db.transaction(async (sql) => {
      const found = await this.locked(sql, id);
      if (!found) return null;
      const { run, file, e } = found;
      requireCondition(
        run.organisation_id === job.organisation_id &&
          run.environment === job.environment &&
          run.actor_id === job.actor_id,
        403,
        'job_scope',
        'Job scope changed.',
      );
      if (
        !['waiting_scan', 'queued'].includes(run.status) ||
        run.dispatch_seq !== job.payload.generation ||
        !(await this.lease(sql, job))
      )
        return null;
      try {
        await this.authorize(sql, run, file, e);
      } catch {
        await this.fail(sql, run, 'access_revoked');
        return null;
      }
      if (['rejected', 'deleted'].includes(file.scan_status)) {
        await this.fail(sql, run, 'scan_rejected');
        return null;
      }
      if (file.scan_status !== 'clean') return null;
      const lease = randomUUID();
      await sql.query(
        "UPDATE document_extractions SET status='running',lease=$1,started_at=now(),updated_at=now() WHERE id=$2",
        [lease, id],
      );
      return { ...found, lease };
    });
    if (!claimed) return;
    let error: string | null = null,
      result: Awaited<ReturnType<DocumentRunner>> | null = null;
    const directory = this.workdir(claimed.lease);
    try {
      const bytes = await this.intact(claimed.run, claimed.file);
      if (!bytes) throw new Error('source_changed');
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const input = path.join(directory, 'input');
      await writeFile(input, bytes, { flag: 'wx', mode: 0o600 });
      if (digest(await readFile(input)) !== claimed.run.source_hash)
        throw new Error('source_changed');
      result = await this.runner(
        input,
        path.extname(claimed.file.original_name).slice(1).toLowerCase(),
        directory,
      );
      z.object({
        text: z
          .string()
          .min(1)
          .refine((v) => Buffer.byteLength(v) <= 120000 && !v.includes('\0')),
        engine: z.string().min(1).max(40),
        pages: z.number().int().min(1).max(20),
        warnings: z.array(z.string().max(500)).max(30),
      }).parse(result);
    } catch (e) {
      error = EXTRACTION_ERRORS[(e as Error).message] ? (e as Error).message : 'parser_failed';
    } finally {
      await this.cleanup(claimed.lease).catch(() => {
        error = 'parser_failed';
      });
    }
    await this.db.transaction(async (sql) => {
      const found = await this.locked(sql, id);
      if (!found) return;
      const { run, file, e } = found;
      if (run.status !== 'running' || run.lease !== claimed.lease) return;
      if (!(await this.lease(sql, job))) {
        await this.fail(sql, run, 'interrupted');
        return;
      }
      let actor: AuthUser;
      try {
        actor = await this.authorize(sql, run, file, e);
      } catch {
        await this.fail(sql, run, 'access_revoked');
        return;
      }
      if (!(await this.intact(run, file))) error = 'source_changed';
      if (error || !result) {
        await this.fail(sql, run, error ?? 'parser_failed');
        return;
      }
      await sql.query(
        "UPDATE document_extractions SET status='ready',extracted_text=$1,engine=$2,page_count=$3,warnings=$4,version=version+1,updated_at=now() WHERE id=$5",
        [
          encrypt(result.text, this.reviews.key),
          result.engine,
          result.pages,
          JSON.stringify(result.warnings),
          id,
        ],
      );
      await this.reviews.enrolments.tenancy.audit(
        sql,
        actor,
        e.organisation_id,
        'extraction.ready',
        id,
        'Private document draft ready for human review',
      );
    });
  }
  async recover() {
    const environment = process.env.NODE_ENV === 'production' ? 'production' : 'test';
    const refs = (
      await this.db.pool.query<{ id: string }>(
        "SELECT id FROM document_extractions WHERE environment=$1 AND (status IN ('waiting_scan','queued','running') OR (status='failed' AND lease IS NOT NULL AND started_at<now()-interval '3 minutes')) ORDER BY id",
        [environment],
      )
    ).rows;
    for (const ref of refs) {
      let cleanup: string | null = null;
      await this.db.transaction(async (sql) => {
        const found = await this.locked(sql, ref.id);
        if (!found) return;
        const { run, file, e } = found;
        if (
          run.status === 'failed' &&
          run.lease &&
          run.started_at &&
          run.started_at < new Date(Date.now() - 180000)
        ) {
          cleanup = run.lease;
          return;
        }
        if (run.status === 'running') {
          if (run.started_at && run.started_at < new Date(Date.now() - 180000)) {
            await this.fail(sql, run, 'interrupted');
            cleanup = run.lease;
          }
          return;
        }
        if (!['waiting_scan', 'queued'].includes(run.status)) return;
        try {
          await this.authorize(sql, run, file, e);
        } catch {
          await this.fail(sql, run, 'access_revoked');
          return;
        }
        if (['rejected', 'deleted'].includes(file.scan_status)) {
          await this.fail(sql, run, 'scan_rejected');
          return;
        }
        if (file.scan_status !== 'clean') return;
        const active = await sql.query(
          "SELECT id FROM outbox_events WHERE organisation_id=$1 AND environment=$2 AND kind='document.extract' AND payload->>'id'=$3 AND (status='pending' OR (status='processing' AND lease_until>now()))",
          [run.organisation_id, run.environment, run.id],
        );
        if (!active.rowCount) await this.dispatch(sql, run);
      });
      if (cleanup) {
        await this.cleanup(cleanup);
        await this.db.pool.query(
          "UPDATE document_extractions SET lease=NULL WHERE id=$1 AND status='failed' AND lease=$2",
          [ref.id, cleanup],
        );
      }
    }
  }
}
