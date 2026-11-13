import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Sql } from '../../database/src/database.js';
import { Auth, type AuthUser } from './auth.js';
import { Enrolments } from './enrolments.js';
import { encrypt, decrypt, digest } from './crypto.js';
import { requireCondition } from './errors.js';
import { enqueue, type Job } from './outbox.js';
import { PrimaryPlatform, type PrimaryAdapter, type PromotionPayload } from './primary-platform.js';
type Promotion = {
  id: string;
  organisation_id: string;
  environment: 'test' | 'production';
  user_id: string;
  actor_id: string;
  idempotency_key: string;
  payload_hash: string;
  payload: string;
  status: string;
  dispatch_version: number;
  external_person_id: string | null;
};
type Person = AuthUser & {
  is_synthetic: boolean;
  active: boolean;
  origin: string;
  sync_policy: string;
  external_person_id: string | null;
};
const reasonSchema = z.string().trim().min(8).max(2000);
export class Promotions {
  readonly enrolments: Enrolments;
  constructor(
    readonly auth: Auth,
    readonly key: Buffer,
    readonly adapter: PrimaryAdapter = new PrimaryPlatform(),
  ) {
    this.enrolments = new Enrolments(auth);
  }
  get db() {
    return this.auth.db;
  }
  private async person(sql: Sql, actor: AuthUser, client: string, userId: string) {
    const user = (
      await sql.query<Person>(
        "SELECT u.* FROM users u WHERE u.id=$1 AND u.environment=$2 AND EXISTS(SELECT 1 FROM client_memberships cm WHERE cm.user_id=u.id AND cm.organisation_id=$3 AND cm.environment=u.environment AND cm.status='active' AND cm.joined_at<=now() AND cm.ended_at IS NULL)",
        [userId, actor.environment, client],
      )
    ).rows[0];
    requireCondition(user, 404, 'person_unavailable', 'This client member is unavailable.');
    return user;
  }
  private async context(sql: Sql, token: string, csrf: string | undefined, client: string) {
    const actor = await this.enrolments.context(sql, token, client, csrf);
    requireCondition(
      await this.enrolments.access.administer(sql, actor, client),
      403,
      'client_admin_required',
      'Client administration permission is required.',
    );
    return actor;
  }
  async list(token: string, client: string, page = 1) {
    z.uuid().parse(client);
    z.number().int().min(1).max(100000).parse(page);
    return this.db.transaction(async (sql) => {
      const actor = await this.context(sql, token, undefined, client);
      const where =
        "p.organisation_id=$1 AND p.environment=$2 AND EXISTS(SELECT 1 FROM client_memberships cm WHERE cm.user_id=p.user_id AND cm.organisation_id=p.organisation_id AND cm.environment=p.environment AND cm.status='active' AND cm.joined_at<=now() AND cm.ended_at IS NULL)";
      const rows = (
        await sql.query(
          `SELECT p.id,p.user_id,p.idempotency_key,p.status,p.external_person_id,p.created_at,u.name,u.export_training_history FROM promotions p JOIN users u ON u.id=p.user_id WHERE ${where} ORDER BY p.created_at DESC,p.id LIMIT 20 OFFSET $3`,
          [client, actor.environment, (page - 1) * 20],
        )
      ).rows;
      const total = (
        await sql.query(`SELECT count(*)::int total FROM promotions p WHERE ${where}`, [
          client,
          actor.environment,
        ])
      ).rows[0].total;
      return { items: rows, total, page, configured: false };
    });
  }
  async request(token: string, csrf: string, client: string, input: unknown) {
    const data = z.object({ userId: z.uuid(), key: z.uuid(), reason: reasonSchema }).parse(input);
    return this.enrolments.tenancy.mutate(token, csrf, client, data.reason, async (sql) => {
      const actor = await this.context(sql, token, csrf, client);
      await sql.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [data.userId]);
      const user = await this.person(sql, actor, client, data.userId);
      requireCondition(
        !user.is_synthetic && user.active && user.origin === 'manual',
        422,
        'promotion_person_invalid',
        'Only real, active manual members can be promoted.',
      );
      const identity = (
        await sql.query<{ issuer: string; subject: string }>(
          'SELECT issuer,subject FROM identities WHERE user_id=$1 AND active ORDER BY id LIMIT 1',
          [user.id],
        )
      ).rows[0];
      requireCondition(
        identity &&
          identity.issuer !==
            (process.env.MOCK_IDENTITY_ISSUER ?? 'https://identity.example.invalid/mock'),
        422,
        'promotion_identity_required',
        'An active verified identity mapping is required.',
      );
      const payload: PromotionPayload = {
        local_person_id: user.id,
        display_name: user.name,
        email: user.email,
        identity,
      };
      const hash = digest(JSON.stringify(payload));
      await sql.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [data.key]);
      const old = (
        await sql.query<Promotion>('SELECT * FROM promotions WHERE idempotency_key=$1', [data.key])
      ).rows[0];
      if (old) {
        requireCondition(
          old.user_id === user.id &&
            old.payload_hash === hash &&
            old.organisation_id === client &&
            old.environment === actor.environment,
          409,
          'promotion_key_conflict',
          'This request key belongs to different promotion content.',
        );
        return { id: old.id, status: old.status };
      }
      requireCondition(
        user.sync_policy === 'local_only' && !user.external_person_id,
        409,
        'promotion_pending',
        'Reconcile the existing promotion or link first.',
      );
      const id = randomUUID();
      await sql.query(
        "INSERT INTO promotions(id,organisation_id,environment,user_id,actor_id,idempotency_key,payload_hash,payload,status,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'prepared',$9)",
        [
          id,
          client,
          actor.environment,
          user.id,
          actor.id,
          data.key,
          hash,
          encrypt(JSON.stringify(payload), this.key),
          data.reason,
        ],
      );
      await sql.query("UPDATE users SET sync_policy='promotion_pending' WHERE id=$1", [user.id]);
      await this.enrolments.tenancy.audit(
        sql,
        actor,
        client,
        'promotion.prepared',
        id,
        data.reason,
      );
      return { id, status: 'prepared' };
    });
  }
  private async record(sql: Sql, actor: AuthUser, client: string, id: string) {
    const row = (
      await sql.query<Promotion>(
        'SELECT * FROM promotions WHERE id=$1 AND organisation_id=$2 AND environment=$3 FOR UPDATE',
        [id, client, actor.environment],
      )
    ).rows[0];
    requireCondition(row, 404, 'promotion_unavailable', 'This promotion is unavailable.');
    await this.person(sql, actor, client, row.user_id);
    return row;
  }
  private async dispatch(sql: Sql, row: Promotion) {
    const version = row.dispatch_version + 1;
    await enqueue(
      sql,
      { actorId: row.actor_id, organisationId: row.organisation_id, environment: row.environment },
      'person.promote',
      `promotion:${row.id}:${version}`,
      { promotionId: row.id, version, reconcile: row.status === 'reconcile_queued' },
    );
    await sql.query('UPDATE promotions SET dispatch_version=$1,updated_at=now() WHERE id=$2', [
      version,
      row.id,
    ]);
  }
  async queue(
    token: string,
    csrf: string,
    client: string,
    id: string,
    reconcile: boolean,
    reason: string,
  ) {
    z.uuid().parse(id);
    reasonSchema.parse(reason);
    return this.enrolments.tenancy.mutate(token, csrf, client, reason, async (sql) => {
      const actor = await this.context(sql, token, csrf, client),
        row = await this.record(sql, actor, client, id);
      requireCondition(
        row.status === (reconcile ? 'ambiguous' : 'prepared'),
        409,
        'promotion_changed',
        'The promotion state changed. Refresh before continuing.',
      );
      row.status = reconcile ? 'reconcile_queued' : 'queued';
      row.actor_id = actor.id;
      await sql.query('UPDATE promotions SET status=$1,actor_id=$2,updated_at=now() WHERE id=$3', [
        row.status,
        actor.id,
        id,
      ]);
      await this.dispatch(sql, row);
      await this.enrolments.tenancy.audit(
        sql,
        actor,
        client,
        'promotion.dispatch_requested',
        id,
        reason,
      );
      return { status: row.status };
    });
  }
  async history(token: string, csrf: string, client: string, userId: string, reason: string) {
    z.uuid().parse(userId);
    reasonSchema.parse(reason);
    return this.enrolments.tenancy.mutate(token, csrf, client, reason, async (sql) => {
      const actor = await this.context(sql, token, csrf, client);
      await sql.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
      const user = await this.person(sql, actor, client, userId);
      requireCondition(
        !user.is_synthetic && user.sync_policy === 'linked' && user.external_person_id,
        409,
        'history_not_linked',
        'History export requires a verified linked member.',
      );
      await sql.query('UPDATE users SET export_training_history=true WHERE id=$1', [user.id]);
      await this.enrolments.tenancy.audit(
        sql,
        actor,
        client,
        'promotion.history_export_authorised',
        user.id,
        reason,
      );
      return { exportTrainingHistory: true };
    });
  }
  private async jobContext(sql: Sql, job: Job) {
    await sql.query('SELECT id FROM organisations WHERE id=$1 FOR UPDATE', [job.organisation_id]);
    const row = (
      await sql.query<Promotion>(
        'SELECT * FROM promotions WHERE id=$1 AND organisation_id=$2 AND environment=$3 AND actor_id=$4 FOR UPDATE',
        [job.payload.promotionId, job.organisation_id, job.environment, job.actor_id],
      )
    ).rows[0];
    if (!row || row.dispatch_version !== job.payload.version) return null;
    const lease = await sql.query(
      "SELECT id FROM outbox_events WHERE id=$1 AND lease_token=$2 AND status='processing' AND lease_until>now()",
      [job.id, job.lease_token],
    );
    requireCondition(lease.rowCount, 409, 'lease_lost', 'The promotion job lease expired.');
    await sql.query('SELECT id FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [
      [row.actor_id, row.user_id],
    ]);
    const actor = (
      await sql.query<AuthUser>('SELECT * FROM users WHERE id=$1 AND environment=$2', [
        row.actor_id,
        row.environment,
      ])
    ).rows[0];
    requireCondition(
      actor && (await this.enrolments.access.administer(sql, actor, row.organisation_id)),
      403,
      'promotion_authority_lost',
      'The promotion actor no longer has client authority.',
    );
    const user = await this.person(sql, actor, row.organisation_id, row.user_id),
      payload = JSON.parse(decrypt(row.payload, this.key)) as PromotionPayload;
    requireCondition(
      !user.is_synthetic && user.active && user.sync_policy === 'promotion_pending',
      409,
      'promotion_person_changed',
      'The promotion member changed before dispatch.',
    );
    requireCondition(
      (
        await sql.query(
          'SELECT id FROM identities WHERE user_id=$1 AND active AND issuer=$2 AND subject=$3',
          [user.id, payload.identity.issuer, payload.identity.subject],
        )
      ).rowCount,
      409,
      'promotion_identity_changed',
      'The verified identity changed before dispatch.',
    );
    return { row, actor, user, payload };
  }
  async process(job: Job) {
    const claimed = await this.db.transaction(async (sql) => {
      const context = await this.jobContext(sql, job);
      if (!context) return null;
      if (context.row.status !== (job.payload.reconcile ? 'reconcile_queued' : 'queued'))
        return null;
      await sql.query("UPDATE promotions SET status='sending',updated_at=now() WHERE id=$1", [
        context.row.id,
      ]);
      return context;
    });
    if (!claimed) return;
    let result: unknown;
    try {
      result = job.payload.reconcile
        ? await this.adapter.findByKey(claimed.row.idempotency_key)
        : await this.adapter.createPerson(claimed.row.idempotency_key, claimed.payload);
    } catch (error) {
      const status =
        error instanceof Error &&
        error.message === 'primary_not_configured' &&
        !job.payload.reconcile
          ? 'prepared'
          : 'ambiguous';
      await this.db.pool.query(
        "UPDATE promotions SET status=$1,updated_at=now() WHERE id=$2 AND status='sending' AND dispatch_version=$3",
        [status, claimed.row.id, claimed.row.dispatch_version],
      );
      return;
    }
    await this.db.transaction(async (sql) => {
      const context = await this.jobContext(sql, job);
      if (!context || context.row.status !== 'sending') return;
      const response = z
        .object({
          idempotency_key: z.literal(claimed.row.idempotency_key),
          local_person_id: z.literal(claimed.user.id),
          person_id: z
            .string()
            .min(1)
            .max(160)
            .refine((value) => value.trim().length > 0),
          identity: z
            .object({
              issuer: z.literal(claimed.payload.identity.issuer),
              subject: z.literal(claimed.payload.identity.subject),
            })
            .strict(),
        })
        .safeParse(result);
      if (!response.success) {
        await sql.query("UPDATE promotions SET status='ambiguous',updated_at=now() WHERE id=$1", [
          context.row.id,
        ]);
        return;
      }
      const duplicate = await sql.query(
        'SELECT u.id FROM users u JOIN client_memberships cm ON cm.user_id=u.id AND cm.environment=u.environment WHERE cm.organisation_id=$1 AND u.environment=$2 AND u.external_person_id=$3 AND u.id<>$4',
        [
          context.row.organisation_id,
          context.row.environment,
          response.data.person_id,
          context.user.id,
        ],
      );
      if (duplicate.rowCount) {
        await sql.query(
          "UPDATE promotions SET status='duplicate_review',updated_at=now() WHERE id=$1",
          [context.row.id],
        );
        return;
      }
      await sql.query(
        "UPDATE users SET sync_policy='linked',external_person_id=$1,linked_at=now(),export_training_history=false WHERE id=$2",
        [response.data.person_id, context.user.id],
      );
      await sql.query(
        "UPDATE promotions SET status='linked',external_person_id=$1,updated_at=now() WHERE id=$2",
        [response.data.person_id, context.row.id],
      );
      await this.enrolments.tenancy.audit(
        sql,
        context.actor,
        context.row.organisation_id,
        'promotion.linked',
        context.row.id,
        'Verified primary mapping; historical export remains disabled.',
      );
    });
  }
  async recover() {
    await this.db.pool.query(
      "UPDATE promotions SET status='ambiguous',updated_at=now() WHERE status='sending' AND updated_at<now()-interval '180 seconds'",
    );
    return this.db.transaction(async (sql) => {
      const rows = (
        await sql.query<Promotion>(
          "SELECT p.* FROM promotions p WHERE p.status IN ('queued','reconcile_queued') AND NOT EXISTS(SELECT 1 FROM outbox_events o WHERE o.kind='person.promote' AND o.payload->>'promotionId'=p.id::text AND (o.status='pending' OR (o.status='processing' AND o.lease_until>now()))) ORDER BY p.created_at FOR UPDATE SKIP LOCKED LIMIT 100",
        )
      ).rows;
      for (const row of rows) await this.dispatch(sql, row);
      return rows.length;
    });
  }
}
