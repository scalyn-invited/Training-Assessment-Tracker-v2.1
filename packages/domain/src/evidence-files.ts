import { learningAlternate, learningAlternateFile } from './learning-access.js';
import { randomUUID } from 'node:crypto';
import { alternateFile, alternateReviewer } from './assessment-access.js';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { Enrolments, type Enrolment } from './enrolments.js';
import type { AuthUser } from './auth.js';
import type { Sql } from '../../database/src/database.js';
import { privatePath } from '../../database/src/config.js';
import { requireCondition } from './errors.js';
import { inspectUpload } from './file-content.js';
import { digest } from './crypto.js';
import { enqueue, type Job } from './outbox.js';
import { scanFile, type Scanner } from './file-scanner.js';
export type EvidenceFile = {
  id: string;
  organisation_id: string;
  environment: 'test' | 'production';
  enrolment_id: string;
  uploaded_by: string;
  storage_key: string;
  original_name: string;
  mime: string;
  bytes: number;
  sha256: string;
  scan_status: string;
  sensitive: boolean;
  purpose: 'evidence' | 'assessment';
  version: number;
  created_at: Date;
};
export class EvidenceFiles {
  constructor(
    readonly enrolments: Enrolments,
    readonly scanner: Scanner = scanFile,
    readonly directory = path.join(privatePath(), 'evidence'),
    readonly assessmentKey?: Buffer,
  ) {}
  file(key: string) {
    requireCondition(/^[a-f0-9-]{36}$/.test(key), 404, 'file_unavailable', 'File is unavailable.');
    return path.join(this.directory, key);
  }
  async canRead(sql: Sql, actor: AuthUser, file: EvidenceFile, enrolment?: Enrolment) {
    const row =
      enrolment ??
      (
        await sql.query<Enrolment>(
          'SELECT * FROM enrolments WHERE id=$1 AND organisation_id=$2 AND environment=$3',
          [file.enrolment_id, file.organisation_id, file.environment],
        )
      ).rows[0];
    if (!row || file.environment !== actor.environment) return false;
    if (!(await this.enrolments.permissions(sql, actor, row)).details)
      return this.assessmentKey
        ? (await alternateFile(sql, actor, row, file.id, this.assessmentKey)) ||
            (await learningAlternateFile(sql, actor, row, file.id, this.assessmentKey))
        : false;

    return (
      actor.id !== row.member_id ||
      !file.sensitive ||
      (file.purpose === 'evidence' && file.uploaded_by === actor.id)
    );
  }
  async list(token: string, client: string, enrolment: string) {
    return this.enrolments.auth.db.transaction(async (sql) => {
      const actor = await this.enrolments.context(sql, token, client);
      const record = (
        await sql.query<Enrolment>(
          'SELECT * FROM enrolments WHERE id=$1 AND organisation_id=$2 AND environment=$3',
          [enrolment, client, actor.environment],
        )
      ).rows[0];
      requireCondition(record, 404, 'enrolment_unavailable', 'This member record is unavailable.');
      let allowed = (await this.enrolments.permissions(sql, actor, record)).details;
      if (!allowed && this.assessmentKey) {
        const cases = (
          await sql.query<{ id: string }>(
            'SELECT id FROM assessment_assignments WHERE enrolment_id=$1 AND organisation_id=$2 AND environment=$3',
            [record.id, client, actor.environment],
          )
        ).rows;
        for (const item of cases)
          if (await alternateReviewer(sql, actor, item.id, record)) {
            allowed = true;
            break;
          }
      }
      if (!allowed && this.assessmentKey) {
        const cases = (
          await sql.query<{ submission_attempt_id: string }>(
            "SELECT submission_attempt_id FROM learning_appeals WHERE enrolment_id=$1 AND organisation_id=$2 AND environment=$3 AND reviewer_id=$4 AND status='open'",
            [record.id, client, actor.environment, actor.id],
          )
        ).rows;
        for (const item of cases)
          if (await learningAlternate(sql, actor, item.submission_attempt_id, record)) {
            allowed = true;
            break;
          }
      }
      requireCondition(allowed, 404, 'enrolment_unavailable', 'This member record is unavailable.');
      const rows = (
        await sql.query<EvidenceFile>(
          'SELECT * FROM evidence_files WHERE enrolment_id=$1 AND organisation_id=$2 AND environment=$3 ORDER BY created_at DESC,id',
          [enrolment, client, actor.environment],
        )
      ).rows;
      const files = [];
      for (const row of rows)
        if (await this.canRead(sql, actor, row, record))
          files.push({
            id: row.id,
            name: row.original_name,
            bytes: Number(row.bytes),
            status: row.scan_status,
            purpose: row.purpose,
            createdAt: row.created_at,
          });
      return {
        files,
        canUpload:
          actor.id === record.member_id ||
          (await this.enrolments.permissions(sql, actor, record)).manage,
      };
    });
  }
  async upload(
    token: string,
    csrf: string,
    client: string,
    enrolment: string,
    bytes: Buffer,
    filename: string,
    purpose: 'assessment' | 'evidence' = 'assessment',
  ) {
    requireCondition(
      ['assessment', 'evidence'].includes(purpose),
      422,
      'file_purpose',
      'Choose assessment or supporting evidence.',
    );
    const requester = await this.enrolments.auth.db.transaction(async (sql) => {
      const actor = await this.enrolments.context(sql, token, client, csrf),
        record = await this.enrolments.record(sql, actor, client, enrolment);
      requireCondition(
        actor.id === record.member_id ||
          (await this.enrolments.permissions(sql, actor, record)).manage,
        403,
        'upload_forbidden',
        'The member or their authorised primary coordinator can upload files.',
      );
      return actor;
    });
    await this.enrolments.auth.limit(
      'evidence-upload:' + requester.environment + ':' + requester.id,
      20,
    );
    const content = await inspectUpload(bytes, filename),
      id = randomUUID(),
      key = randomUUID();
    await mkdir(this.directory, { recursive: true });
    await writeFile(this.file(key), bytes, { flag: 'wx', mode: 0o600 });
    try {
      return await this.enrolments.auth.db.transaction(async (sql) => {
        await sql.query('SELECT id FROM organisations WHERE id=$1 FOR UPDATE', [client]);
        const actor = await this.enrolments.context(sql, token, client, csrf),
          record = await this.enrolments.record(sql, actor, client, enrolment);
        await sql.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [actor.id]);
        requireCondition(
          actor.id === record.member_id ||
            (await this.enrolments.permissions(sql, actor, record)).manage,
          403,
          'upload_forbidden',
          'Upload permission is no longer available.',
        );
        await sql.query(
          'INSERT INTO evidence_files(id,organisation_id,environment,enrolment_id,uploaded_by,storage_key,original_name,mime,bytes,sha256,purpose) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
          [
            id,
            client,
            actor.environment,
            enrolment,
            actor.id,
            key,
            content.name,
            content.mime,
            bytes.length,
            digest(bytes),
            purpose,
          ],
        );
        await enqueue(
          sql,
          { organisationId: client, environment: actor.environment, actorId: actor.id },
          'evidence.scan',
          'evidence:' + id + ':1',
          { id, version: 1 },
        );
        await this.enrolments.tenancy.audit(
          sql,
          actor,
          client,
          'evidence.quarantined',
          id,
          'Private upload awaiting scanner approval',
        );
        return { id, status: 'quarantined' };
      });
    } catch (error) {
      await unlink(this.file(key)).catch(() => {});
      throw error;
    }
  }
  async download(token: string, id: string) {
    const authorized = await this.enrolments.auth.db.transaction(async (sql) => {
      const { user, session } = await this.enrolments.auth.verified(sql, token);
      const row = (
        await sql.query<EvidenceFile>(
          'SELECT * FROM evidence_files WHERE id=$1 AND organisation_id=$2 AND environment=$3',
          [id, session.organisation_id, user!.environment],
        )
      ).rows[0];
      requireCondition(
        row && (await this.canRead(sql, user!, row)),
        404,
        'file_unavailable',
        'File is unavailable.',
      );
      requireCondition(
        row.scan_status === 'clean',
        409,
        'file_quarantined',
        'File is quarantined pending scanner approval.',
      );
      return row;
    });
    const bytes = await readFile(this.file(authorized.storage_key)).catch(() => null);
    requireCondition(
      bytes && digest(bytes) === authorized.sha256,
      404,
      'file_unavailable',
      'The stored file is unavailable or has changed.',
    );
    await this.enrolments.auth.db.transaction(async (sql) => {
      const actor = await this.enrolments.context(sql, token, authorized.organisation_id);

      const current = (
        await sql.query<EvidenceFile>(
          'SELECT * FROM evidence_files WHERE id=$1 AND organisation_id=$2 AND environment=$3',
          [id, authorized.organisation_id, actor.environment],
        )
      ).rows[0];
      requireCondition(
        current &&
          current.scan_status === 'clean' &&
          current.sha256 === authorized.sha256 &&
          (await this.canRead(sql, actor, current)),
        404,
        'file_unavailable',
        'File is unavailable.',
      );
      await this.enrolments.tenancy.audit(
        sql,
        actor,
        authorized.organisation_id,
        'evidence.downloaded',
        id,
        'Authorised private download',
      );
    });
    return { bytes, name: authorized.original_name };
  }
  async process(job: Job) {
    requireCondition(
      job.environment === (process.env.NODE_ENV === 'production' ? 'production' : 'test'),
      403,
      'environment_mismatch',
      'Cannot scan another environment.',
    );
    const db = this.enrolments.auth.db;
    const row = await db.transaction(async (sql) => {
      await sql.query('SELECT id FROM organisations WHERE id=$1 FOR UPDATE', [job.organisation_id]);
      if (!(await this.enrolments.access.available(sql, job.organisation_id, job.environment)))
        return null;
      return (
        (
          await sql.query<EvidenceFile>(
            "UPDATE evidence_files SET scan_status='scanning',scan_token=$1,updated_at=now() WHERE id=$2 AND organisation_id=$3 AND environment=$4 AND scan_status='quarantined' AND version=$5 RETURNING *",
            [
              job.lease_token,
              job.payload.id,
              job.organisation_id,
              job.environment,
              job.payload.version,
            ],
          )
        ).rows[0] ?? null
      );
    });
    if (!row) return;
    let status = 'quarantined';
    try {
      const before = await readFile(this.file(row.storage_key));
      if (digest(before) !== row.sha256) status = 'rejected';
      else {
        const result = await this.scanner(this.file(row.storage_key)),
          after = await readFile(this.file(row.storage_key));
        status =
          digest(after) !== row.sha256
            ? 'rejected'
            : result === 'clean'
              ? 'clean'
              : result === 'rejected'
                ? 'rejected'
                : 'quarantined';
      }
    } catch (error) {
      status = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'rejected' : 'quarantined';
    }
    await db.transaction(async (sql) => {
      await sql.query('SELECT id FROM organisations WHERE id=$1 FOR UPDATE', [row.organisation_id]);
      if (!(await this.enrolments.access.available(sql, row.organisation_id, row.environment)))
        status = 'quarantined';
      await sql.query(
        "UPDATE evidence_files SET scan_status=$1,scan_token=NULL,updated_at=now() WHERE id=$2 AND version=$3 AND scan_status='scanning' AND scan_token=$4 AND EXISTS(SELECT 1 FROM outbox_events WHERE id=$5 AND status='processing' AND lease_token=$4 AND lease_until>now())",
        [status, row.id, row.version, job.lease_token, job.id],
      );
    });
  }
  async recover() {
    if (!process.env.CLAMSCAN_PATH) return;
    const db = this.enrolments.auth.db,
      environment = process.env.NODE_ENV === 'production' ? 'production' : 'test';
    const rows = (
      await db.pool.query<EvidenceFile>(
        "SELECT * FROM evidence_files WHERE environment=$1 AND (scan_status='quarantined' OR (scan_status='scanning' AND updated_at<now()-interval '3 minutes')) ORDER BY id",
        [environment],
      )
    ).rows;
    for (const row of rows)
      await db.transaction(async (sql) => {
        await sql.query('SELECT id FROM organisations WHERE id=$1 FOR UPDATE', [
          row.organisation_id,
        ]);
        if (!(await this.enrolments.access.available(sql, row.organisation_id, environment)))
          return;
        const current = (
          await sql.query<EvidenceFile>(
            "SELECT * FROM evidence_files WHERE id=$1 AND (scan_status='quarantined' OR (scan_status='scanning' AND updated_at<now()-interval '3 minutes')) FOR UPDATE",
            [row.id],
          )
        ).rows[0];
        if (!current) return;
        if (
          (
            await sql.query(
              "SELECT id FROM outbox_events WHERE kind='evidence.scan' AND organisation_id=$1 AND environment=$2 AND payload->>'id'=$3 AND (status='pending' OR (status='processing' AND lease_until>now()))",
              [row.organisation_id, environment, row.id],
            )
          ).rowCount
        )
          return;
        await sql.query(
          "UPDATE evidence_files SET scan_status='quarantined',version=version+1,scan_token=NULL,updated_at=now() WHERE id=$1",
          [row.id],
        );
        await enqueue(
          sql,
          {
            organisationId: row.organisation_id,
            environment: row.environment,
            actorId: row.uploaded_by,
          },
          'evidence.scan',
          'evidence:' + row.id + ':' + (current.version + 1),
          { id: row.id, version: current.version + 1 },
        );
      });
  }
}
