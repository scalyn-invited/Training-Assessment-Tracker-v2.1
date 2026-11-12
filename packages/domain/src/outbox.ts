import { createHash, randomUUID } from 'node:crypto';
import type { Scope } from '../../contracts/src/index.js';
import type { Sql, Database } from '../../database/src/database.js';
import { DomainError } from './errors.js';
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return (
    '{' +
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
      .join(',') +
    '}'
  );
}
export async function enqueue(
  sql: Sql,
  scope: Scope,
  kind: string,
  key: string,
  payload: Record<string, unknown>,
): Promise<string> {
  if (!key || key.length > 128)
    throw new DomainError(
      422,
      'invalid_key',
      'An idempotency key of 1–128 characters is required.',
    );
  const hash = createHash('sha256').update(canonical({ kind, payload })).digest('hex');
  const id = randomUUID();
  const inserted = await sql.query<{ id: string }>(
    `INSERT INTO outbox_events(id,organisation_id,environment,actor_id,kind,idempotency_key,payload_hash,payload)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(organisation_id,environment,actor_id,idempotency_key) DO NOTHING RETURNING id`,
    [
      id,
      scope.organisationId,
      scope.environment,
      scope.actorId,
      kind,
      key,
      hash,
      JSON.stringify(payload),
    ],
  );
  if (inserted.rows[0]) return inserted.rows[0].id;
  const existing = await sql.query<{ id: string; payload_hash: string }>(
    'SELECT id,payload_hash FROM outbox_events WHERE organisation_id=$1 AND environment=$2 AND actor_id=$3 AND idempotency_key=$4',
    [scope.organisationId, scope.environment, scope.actorId, key],
  );
  if (!existing.rows[0] || existing.rows[0].payload_hash !== hash)
    throw new DomainError(
      409,
      'idempotency_conflict',
      'This request key has already been used for different content.',
    );
  return existing.rows[0].id;
}
export type Job = {
  id: string;
  organisation_id: string;
  environment: 'test' | 'production';
  actor_id: string;
  kind: string;
  payload: Record<string, unknown>;
  lease_token: string;
  attempts: number;
};
export async function claim(db: Database): Promise<Job | undefined> {
  return db.transaction(async (sql) => {
    // Interrupted external effects are ambiguous, never silently sent twice.
    await sql.query(
      "UPDATE outbox_events SET status='uncertain',last_error='lease_expired',updated_at=now() WHERE status='processing' AND lease_until<now()",
    );
    const result = await sql.query<Job>(
      `UPDATE outbox_events SET status='processing',attempts=attempts+1,lease_token=$1,lease_until=now()+interval '2 minutes',updated_at=now()
   WHERE id=(SELECT id FROM outbox_events WHERE status='pending' AND available_at<=now() ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,
      [randomUUID()],
    );
    return result.rows[0];
  });
}
export async function finish(
  db: Database,
  job: Job,
  status: 'done' | 'failed' | 'uncertain',
  error: string | null = null,
) {
  const result = await db.pool.query(
    "UPDATE outbox_events SET status=$1,last_error=$2,lease_until=NULL,updated_at=now() WHERE id=$3 AND lease_token=$4 AND status='processing' AND lease_until>now() RETURNING id",
    [status, error, job.id, job.lease_token],
  );
  if (!result.rowCount)
    throw new DomainError(409, 'lease_lost', 'The job lease is no longer valid.');
}
