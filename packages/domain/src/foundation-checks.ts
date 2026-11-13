import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { Enrolments, type Enrolment } from './enrolments.js';
import type { AuthUser } from './auth.js';
import { enqueue, type Job } from './outbox.js';
import { requireCondition } from './errors.js';
export class FoundationChecks {
  constructor(readonly enrolments: Enrolments) {}
  get db() {
    return this.enrolments.auth.db;
  }
  async request(token: string, csrf: string, client: string, id: string, input: unknown) {
    const data = z
      .object({ version: z.number().int().positive(), key: z.string().min(8).max(128) })
      .parse(input);
    return this.db.transaction(async (sql) => {
      await sql.query('SELECT id FROM organisations WHERE id=$1 FOR UPDATE', [client]);
      const actor = await this.enrolments.context(sql, token, client, csrf);
      await sql.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [actor.id]);
      await sql.query(
        'SELECT id FROM enrolments WHERE id=$1 AND organisation_id=$2 AND environment=$3 FOR UPDATE',
        [id, client, actor.environment],
      );
      const record = await this.enrolments.record(sql, actor, client, id);
      const existing = (
        await sql.query(
          'SELECT * FROM foundation_checks WHERE actor_id=$1 AND idempotency_key=$2',
          [actor.id, data.key],
        )
      ).rows[0];
      if (existing) {
        requireCondition(
          existing.organisation_id === client &&
            existing.environment === actor.environment &&
            existing.enrolment_id === id &&
            existing.enrolment_version === data.version,
          409,
          'idempotency_conflict',
          'This request key was already used for different content.',
        );
        return { id: existing.id };
      }
      requireCondition(
        record.version === data.version,
        409,
        'enrolment_changed',
        'The enrolment changed. Reload before retrying.',
      );
      const job = await enqueue(
        sql,
        { actorId: actor.id, organisationId: client, environment: actor.environment },
        'foundation.check',
        data.key,
        { enrolmentId: id, version: data.version },
      );
      await sql.query(
        'INSERT INTO foundation_checks(id,organisation_id,environment,actor_id,enrolment_id,enrolment_version,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [job, client, actor.environment, actor.id, id, data.version, data.key],
      );
      await sql.query(
        "INSERT INTO audit_events(id,organisation_id,environment,actor_id,action,target_id,metadata) VALUES($1,$2,$3,$4,'foundation.check.requested',$5,$6)",
        [
          randomUUID(),
          client,
          actor.environment,
          actor.id,
          job,
          { enrolment_version: data.version },
        ],
      );
      return { id: job };
    });
  }
  async list(token: string, client: string, id?: string) {
    return this.db.transaction(async (sql) => {
      const actor = await this.enrolments.context(sql, token, client);
      const rows = (
        await sql.query(
          'SELECT c.*,o.status queue_status FROM foundation_checks c JOIN outbox_events o ON o.id=c.id WHERE c.organisation_id=$1 AND c.environment=$2 AND c.actor_id=$3 AND ($4::uuid IS NULL OR c.id=$4) ORDER BY c.created_at DESC,c.id DESC',
          [client, actor.environment, actor.id, id ?? null],
        )
      ).rows;
      const visible = [];
      for (const row of rows) {
        const record = (
          await sql.query<Enrolment>(
            'SELECT * FROM enrolments WHERE id=$1 AND organisation_id=$2 AND environment=$3',
            [row.enrolment_id, client, actor.environment],
          )
        ).rows[0];
        if (!record || !(await this.enrolments.permissions(sql, actor, record)).view) continue;
        visible.push({
          id: row.id,
          state:
            row.status === 'pending' && row.queue_status === 'processing'
              ? 'processing'
              : row.status,
          errorCode: row.error_code,
          createdAt: row.created_at,
          receiptAt: row.receipt_at,
        });
        if (visible.length === 5) break;
      }
      requireCondition(
        !id || visible.length === 1,
        404,
        'check_unavailable',
        'This background check is unavailable.',
      );
      return visible;
    });
  }
  async process(job: Job) {
    requireCondition(
      job.kind === 'foundation.check' &&
        job.environment === (process.env.NODE_ENV === 'production' ? 'production' : 'test'),
      403,
      'environment_mismatch',
      'Cannot process a check from another environment.',
    );
    await this.db.transaction(async (sql) => {
      await sql.query('SELECT id FROM organisations WHERE id=$1 FOR UPDATE', [job.organisation_id]);
      const actor = (
        await sql.query<AuthUser>('SELECT * FROM users WHERE id=$1 FOR UPDATE', [job.actor_id])
      ).rows[0];
      const stored = (
        await sql.query(
          "SELECT c.* FROM foundation_checks c JOIN outbox_events o ON o.id=c.id WHERE c.id=$1 AND o.lease_token=$2 AND o.status='processing' AND o.lease_until>now() FOR UPDATE OF c,o",
          [job.id, job.lease_token],
        )
      ).rows[0];
      requireCondition(
        stored &&
          stored.organisation_id === job.organisation_id &&
          stored.actor_id === job.actor_id &&
          stored.environment === job.environment,
        409,
        'lease_lost',
        'The check lease is no longer valid.',
      );
      if (stored.status === 'pending') {
        const record = (
          await sql.query<Enrolment>(
            'SELECT * FROM enrolments WHERE id=$1 AND organisation_id=$2 AND environment=$3 FOR UPDATE',
            [stored.enrolment_id, stored.organisation_id, stored.environment],
          )
        ).rows[0];
        const allowed =
          actor &&
          record &&
          actor.environment === stored.environment &&
          record.version === stored.enrolment_version &&
          (await this.enrolments.access.active(sql, actor.id, actor.environment)) &&
          (await this.enrolments.access.available(
            sql,
            stored.organisation_id,
            stored.environment,
          )) &&
          (await this.enrolments.permissions(sql, actor, record)).view;
        if (!allowed)
          await sql.query(
            "UPDATE foundation_checks SET status='cancelled',error_code='authority_or_version_changed' WHERE id=$1",
            [job.id],
          );
        else {
          await sql.query(
            "UPDATE foundation_checks SET status='delivered',receipt_at=now(),error_code=NULL WHERE id=$1",
            [job.id],
          );
          await this.enrolments.tenancy.audit(
            sql,
            actor,
            stored.organisation_id,
            'foundation.check.completed',
            job.id,
            'Non-delivering database receipt recorded',
          );
        }
      }
      await sql.query(
        "UPDATE outbox_events SET status='done',last_error=NULL,lease_until=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2",
        [job.id, job.lease_token],
      );
    });
  }
  async retry(job: Job) {
    requireCondition(
      job.kind === 'foundation.check' &&
        job.environment === (process.env.NODE_ENV === 'production' ? 'production' : 'test'),
      403,
      'environment_mismatch',
      'Cannot retry a check from another environment.',
    );
    await this.db.transaction(async (sql) => {
      const current = (
        await sql.query(
          "SELECT * FROM outbox_events WHERE id=$1 AND lease_token=$2 AND status='processing' FOR UPDATE",
          [job.id, job.lease_token],
        )
      ).rows[0];
      if (!current) return;
      const failed = current.attempts >= 3;
      await sql.query(
        "UPDATE outbox_events SET status=$2,last_error=$3,lease_until=NULL,available_at=now()+($4::int*interval '1 second'),updated_at=now() WHERE id=$1",
        [
          job.id,
          failed ? 'failed' : 'pending',
          failed ? 'retry_budget_exhausted' : 'local_check_retry',
          current.attempts === 1 ? 10 : 30,
        ],
      );
      if (failed)
        await sql.query(
          "UPDATE foundation_checks SET status='failed',error_code='retry_budget_exhausted' WHERE id=$1 AND status='pending'",
          [job.id],
        );
    });
  }
  async recover() {
    // Only this non-delivering, transactionally recorded job can be replayed after a lost lease.
    await this.db.transaction(async (sql) => {
      const rows = (
        await sql.query(
          "SELECT o.id,o.attempts FROM outbox_events o JOIN foundation_checks c ON c.id=o.id WHERE o.kind='foundation.check' AND o.environment=$1 AND c.status='pending' AND ((o.status='processing' AND o.lease_until<now()) OR (o.status='uncertain' AND o.last_error='lease_expired')) FOR UPDATE OF o,c",
          [process.env.NODE_ENV === 'production' ? 'production' : 'test'],
        )
      ).rows;
      for (const row of rows) {
        const failed = row.attempts >= 3;
        await sql.query(
          'UPDATE outbox_events SET status=$2,last_error=$3,lease_until=NULL,available_at=now(),updated_at=now() WHERE id=$1',
          [row.id, failed ? 'failed' : 'pending', failed ? 'retry_budget_exhausted' : null],
        );
        if (failed)
          await sql.query(
            "UPDATE foundation_checks SET status='failed',error_code='retry_budget_exhausted' WHERE id=$1",
            [row.id],
          );
      }
    });
  }
}
