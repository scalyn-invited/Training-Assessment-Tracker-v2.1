import { randomUUID } from 'node:crypto';
import { statfs, unlink } from 'node:fs/promises';
import type { Sql } from '../../database/src/database.js';
import { privatePath } from '../../database/src/config.js';
import { EvidenceFiles, type EvidenceFile } from './evidence-files.js';
import { digest } from './crypto.js';
import { requireCondition, DomainError } from './errors.js';

export class Operations {
  constructor(readonly files: EvidenceFiles) {}
  get db() {
    return this.files.enrolments.auth.db;
  }
  environment() {
    return process.env.NODE_ENV === 'production' ? 'production' : 'test';
  }
  async heartbeat(component: 'worker' | 'scheduler') {
    requireCondition(
      ['worker', 'scheduler'].includes(component),
      422,
      'invalid_component',
      'Choose worker or scheduler.',
    );
    await this.db.pool.query(
      'INSERT INTO operational_heartbeats(component) VALUES($1) ON CONFLICT(component) DO UPDATE SET seen_at=now()',
      [component],
    );
  }
  async report() {
    const result = await this.db.transaction(async (sql) => {
      const environment = this.environment();
      const beats = (
        await sql.query<{ component: string; seen_at: Date; stale: boolean }>(
          "SELECT component,seen_at,seen_at<now()-interval '5 minutes' stale FROM operational_heartbeats",
        )
      ).rows;
      const jobs = (
        await sql.query<{ queued_jobs: number; oldest_job_at: Date | null; failed_jobs: number }>(
          "SELECT count(*) FILTER(WHERE status IN ('pending','processing'))::int queued_jobs,min(created_at) FILTER(WHERE status IN ('pending','processing')) oldest_job_at,count(*) FILTER(WHERE status='failed')::int failed_jobs FROM outbox_events WHERE environment=$1",
          [environment],
        )
      ).rows[0];
      const counts = (
        await sql.query(
          `SELECT
        (SELECT count(*)::int FROM submission_attempts WHERE environment=$1 AND status IN ('submitted','queued','review_pending','technical_failure')) pending_reviews,
        (SELECT count(*)::int FROM document_extractions WHERE environment=$1 AND status='waiting_scan') extractions_waiting_scan,
        (SELECT count(*)::int FROM document_extractions WHERE environment=$1 AND status='failed') extractions_failed,
        (SELECT count(*)::int FROM ai_runs WHERE environment=$1 AND status='ambiguous') ambiguous_ai_runs,
        (SELECT coalesce(sum(spent),0)::text FROM ai_runs WHERE environment=$1) ai_spent_micro_usd,
        (SELECT count(*)::int FROM learning_notifications WHERE environment=$1 AND status='ambiguous') ambiguous_smtp,
        (SELECT count(*)::int FROM learning_notifications WHERE environment=$1 AND status='pending') pending_notifications`,
          [environment],
        )
      ).rows[0];
      return {
        checked_at: new Date().toISOString(),
        database: 'ok',
        environment,
        heartbeats: Object.fromEntries(beats.map((b) => [b.component, b.seen_at])),
        stale_components: ['worker', 'scheduler'].filter(
          (c) => !beats.some((b) => b.component === c && !b.stale),
        ),
        ...jobs,
        ...counts,
      };
    });
    const disk = await statfs(privatePath()).catch(() => null);
    return {
      ...result,
      disk_free_bytes: disk ? disk.bavail * disk.bsize : null,
      retention_policy_approved: process.env.RETENTION_APPROVED === 'true',
      launch_ready: false,
      launch_gates: [
        'Live OIDC/MFA and delegated identity',
        'Primary-platform contract and sync',
        'Qualified AI models and calibrated grading',
        'SMTP sender/delivery verification',
        'Host qualification, encrypted offsite restore and pilot sign-off',
      ],
    };
  }
  async hold(token: string, csrf: string, client: string, enrolmentId: string, reason: string) {
    const enrolments = this.files.enrolments;
    return enrolments.tenancy.mutate(token, csrf, client, reason, async (sql, actor) => {
      await enrolments.context(sql, token, client, csrf);
      const found = (
        await sql.query(
          'SELECT id FROM enrolments WHERE id=$1 AND organisation_id=$2 AND environment=$3',
          [enrolmentId, client, actor.environment],
        )
      ).rowCount;
      requireCondition(found, 404, 'enrolment_unavailable', 'This member record is unavailable.');
      const id = randomUUID();
      await sql.query(
        'INSERT INTO legal_holds(id,organisation_id,environment,enrolment_id,actor_id,reason) VALUES($1,$2,$3,$4,$5,$6)',
        [id, client, actor.environment, enrolmentId, actor.id, reason.trim()],
      );
      await enrolments.tenancy.audit(
        sql,
        actor,
        client,
        'retention.hold_created',
        enrolmentId,
        reason,
      );
      return { id };
    });
  }
  private async lockOrganisations(sql: Sql) {
    await sql.query('SELECT id FROM organisations ORDER BY id FOR UPDATE');
  }
  private async redact(sql: Sql, file: EvidenceFile) {
    await sql.query(
      "UPDATE evidence_files SET scan_status='deleted',original_name='[removed under retention policy]',bytes=0,scan_token=NULL,version=version+1,updated_at=now() WHERE id=$1 AND (scan_status<>'deleted' OR bytes<>0 OR original_name<>'[removed under retention policy]')",
      [file.id],
    );
    await sql.query(
      "UPDATE document_extractions SET status='purged',extracted_text=NULL,review_data=NULL,warnings=NULL,lease=NULL,version=version+1,updated_at=now() WHERE evidence_file_id=$1 AND (status<>'purged' OR extracted_text IS NOT NULL OR review_data IS NOT NULL OR warnings IS NOT NULL)",
      [file.id],
    );
    await sql.query(
      'UPDATE assessment_file_confirmations SET text=NULL WHERE evidence_file_id=$1 AND text IS NOT NULL',
      [file.id],
    );
  }
  async retain(apply = false) {
    requireCondition(
      !apply || process.env.RETENTION_APPROVED === 'true',
      409,
      'retention_unapproved',
      'Approve a retention policy before applying deletions.',
    );
    const result = await this.db.transaction(async (sql) => {
      await this.lockOrganisations(sql);
      const environment = this.environment();
      const held = (
        await sql.query(
          'SELECT count(DISTINCT enrolment_id)::int count FROM legal_holds WHERE environment=$1 AND released_at IS NULL',
          [environment],
        )
      ).rows[0].count;
      const files = (
        await sql.query<EvidenceFile>(
          "SELECT f.* FROM evidence_files f WHERE f.environment=$1 AND f.created_at<now()-interval '24 months' AND f.scan_status<>'deleted' AND NOT EXISTS(SELECT 1 FROM legal_holds h WHERE h.enrolment_id=f.enrolment_id AND h.released_at IS NULL) ORDER BY f.id FOR UPDATE",
          [environment],
        )
      ).rows;
      const result = {
        mode: apply ? 'apply' : 'dry_run',
        policy: 'evidence-24-months-v1',
        eligible_files: files.length,
        held_enrolments: held,
      };
      if (apply)
        for (const file of files) {
          this.files.file(file.storage_key);
          await sql.query(
            "INSERT INTO deletion_ledger(id,organisation_id,environment,kind,target_id,object_hash,policy_version) VALUES($1,$2,$3,'evidence_file',$4,$5,$6) ON CONFLICT(kind,target_id) DO NOTHING",
            [
              randomUUID(),
              file.organisation_id,
              file.environment,
              file.id,
              digest(file.storage_key),
              result.policy,
            ],
          );
          const receipt = (
            await sql.query<{ object_hash: string }>(
              'SELECT object_hash FROM deletion_ledger WHERE target_id=$1',
              [file.id],
            )
          ).rows[0];
          requireCondition(
            receipt.object_hash === digest(file.storage_key),
            409,
            'deletion_object_changed',
            'The deletion receipt does not match the private object.',
          );
          await this.redact(sql, file);
        }
      return result;
    });
    if (apply) await this.reapplyDeletions();
    return result;
  }
  async reapplyDeletions() {
    const entries = (
      await this.db.pool.query<{ target_id: string; object_hash: string; organisation_id: string }>(
        'SELECT target_id,object_hash,organisation_id FROM deletion_ledger WHERE environment=$1 ORDER BY created_at,id',
        [this.environment()],
      )
    ).rows;
    let count = 0;
    for (const entry of entries) {
      const key = await this.db.transaction(async (sql) => {
        await sql.query('SELECT id FROM organisations WHERE id=$1 FOR UPDATE', [
          entry.organisation_id,
        ]);
        const file = (
          await sql.query<EvidenceFile>(
            'SELECT * FROM evidence_files WHERE id=$1 AND organisation_id=$2 AND environment=$3 FOR UPDATE',
            [entry.target_id, entry.organisation_id, this.environment()],
          )
        ).rows[0];
        if (!file || digest(file.storage_key) !== entry.object_hash) return null;
        this.files.file(file.storage_key);
        await this.redact(sql, file);
        return file.storage_key;
      });
      if (!key) continue;
      try {
        await unlink(this.files.file(key));
        count++;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
          throw new DomainError(
            503,
            'private_removal_failed',
            'Private object removal failed. Replay the deletion ledger before restoring access.',
          );
      }
    }
    return count;
  }
  async pruneAi() {
    return this.db.transaction(async (sql) => {
      await this.lockOrganisations(sql);
      const ids = (
        await sql.query<{ id: string }>(
          "SELECT r.id FROM ai_runs r WHERE r.environment=$1 AND r.status NOT IN ('queued','running','ambiguous') AND r.updated_at<now()-interval '30 days' AND NOT EXISTS(SELECT 1 FROM legal_holds h WHERE h.enrolment_id=r.enrolment_id AND h.released_at IS NULL) ORDER BY r.id FOR UPDATE",
          [this.environment()],
        )
      ).rows.map((r) => r.id);
      if (ids.length) {
        await sql.query('UPDATE ai_blocks SET output=NULL WHERE ai_run_id=ANY($1::uuid[])', [ids]);
        await sql.query(
          'UPDATE ai_runs SET task_input=NULL,feedback=NULL WHERE id=ANY($1::uuid[])',
          [ids],
        );
      }
      return ids.length;
    });
  }
}
