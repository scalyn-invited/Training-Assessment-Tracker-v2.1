import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Database, Sql } from '../../database/src/database.js';
import { MockIdentity } from './mock-identity.js';
import { digest } from './crypto.js';
import { invalidate } from './tenancy.js';
import { requireCondition } from './errors.js';
import { learningAlternate } from './learning-access.js';
import type { AuthUser } from './auth.js';
import type { Enrolment } from './enrolments.js';
const eventSchema = z
  .object({
    event_id: z.uuid(),
    entity_id: z.string().min(1).max(160),
    entity_version: z.number().int().min(1),
    environment: z.literal('test'),
    source: z.literal('primary-platform'),
    event_type: z.enum(['person.upserted', 'person.deactivated', 'membership.changed']),
    payload: z.record(z.string(), z.unknown()),
  })
  .passthrough();
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
// Synthetic local contract only. No network client or inferred identity grants.
export class SandboxDirectory {
  constructor(
    readonly db: Database,
    readonly mock: MockIdentity,
  ) {}
  private async lock(sql: Sql, client: string) {
    z.uuid().parse(client);
    requireCondition(
      (
        await sql.query(
          "SELECT o.id FROM organisations o JOIN platform_client_states s ON s.organisation_id=o.id AND s.environment='test' WHERE o.id=$1 FOR UPDATE OF o",
          [client],
        )
      ).rowCount,
      404,
      'client_unavailable',
      'This test client is unavailable.',
    );
  }
  async page(client: string, expectedCursor: string | null, nextCursor: string, events: unknown[]) {
    this.mock.assertEnabled();
    z.string().max(255).parse(nextCursor);
    z.array(z.unknown()).max(100).parse(events);
    return this.db.transaction(async (sql) => {
      await this.lock(sql, client);
      const cursor = (
        await sql.query(
          "SELECT cursor FROM integration_cursors WHERE organisation_id=$1 AND environment='test' AND stream='directory'",
          [client],
        )
      ).rows[0];
      requireCondition(
        (cursor?.cursor ?? null) === expectedCursor,
        409,
        'directory_cursor_changed',
        'Directory cursor changed. Reconcile before continuing.',
      );
      for (const event of events) await this.applyIn(sql, client, event);
      await sql.query(
        "INSERT INTO integration_cursors(id,organisation_id,environment,stream,cursor) VALUES($1,$2,'test','directory',$3) ON CONFLICT(organisation_id,environment,stream) DO UPDATE SET cursor=EXCLUDED.cursor,last_success_at=now(),updated_at=now()",
        [randomUUID(), client, nextCursor],
      );
    });
  }
  async apply(client: string, input: unknown) {
    this.mock.assertEnabled();
    return this.db.transaction(async (sql) => {
      await this.lock(sql, client);
      return this.applyIn(sql, client, input);
    });
  }
  private async person(sql: Sql, client: string, external: string) {
    return (
      await sql.query<{
        id: string;
        active: boolean;
        is_synthetic: boolean;
        origin: string;
        sync_policy: string;
      }>(
        "SELECT u.* FROM directory_people p JOIN users u ON u.id=p.user_id AND u.environment=p.environment WHERE p.organisation_id=$1 AND p.environment='test' AND p.external_person_id=$2 FOR UPDATE OF u",
        [client, external],
      )
    ).rows[0];
  }
  private async applyIn(
    sql: Sql,
    client: string,
    input: unknown,
  ): Promise<'applied' | 'stale' | 'duplicate'> {
    const event = eventSchema.parse(input),
      hash = digest(JSON.stringify(canonical(event)));
    // Global event identity is serialized as well as each client stream.
    await sql.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [event.event_id]);
    const seen = (
      await sql.query('SELECT organisation_id,payload_hash FROM inbound_events WHERE event_id=$1', [
        event.event_id,
      ])
    ).rows[0];
    if (seen) {
      requireCondition(
        seen.organisation_id === client && seen.payload_hash === hash,
        409,
        'directory_event_conflict',
        'This event identity has conflicting content.',
      );
      return 'duplicate';
    }
    const latest = (
      await sql.query(
        "SELECT COALESCE(max(entity_version),0) version FROM inbound_events WHERE organisation_id=$1 AND environment='test' AND entity_id=$2",
        [client, event.entity_id],
      )
    ).rows[0].version;
    const outcome = event.entity_version <= latest ? 'stale' : 'applied';
    if (outcome === 'applied') {
      let user;
      if (event.event_type === 'membership.changed') {
        const payload = z
          .object({ person_source_id: z.string().min(1), group_id: z.uuid(), active: z.boolean() })
          .parse(event.payload);
        user = await this.person(sql, client, payload.person_source_id);
        requireCondition(
          user?.is_synthetic && user.origin === 'primary_import' && user.sync_policy === 'linked',
          422,
          'directory_person_unknown',
          'Unknown linked synthetic person.',
        );
        const mapping = await sql.query(
          "UPDATE directory_memberships SET ends_at=CASE WHEN $4 THEN NULL ELSE now() END WHERE organisation_id=$1 AND environment='test' AND user_id=$2 AND group_id=$3 RETURNING id",
          [client, user.id, payload.group_id, payload.active],
        );
        requireCondition(
          mapping.rowCount,
          422,
          'directory_membership_unknown',
          'Unknown sandbox membership mapping.',
        );
        if (!payload.active)
          await sql.query(
            "UPDATE client_team_memberships SET ends_at=now() WHERE organisation_id=$1 AND environment='test' AND group_id=$2 AND client_membership_id IN (SELECT id FROM client_memberships WHERE user_id=$3) AND ends_at IS NULL",
            [client, payload.group_id, user.id],
          );
      } else {
        user = await this.person(sql, client, event.entity_id);
        if (event.event_type === 'person.upserted') {
          const payload = z
            .object({ display_name: z.string().min(1).max(120), active: z.boolean() })
            .parse(event.payload);
          if (!user) {
            const id = randomUUID();
            await sql.query(
              "INSERT INTO users(id,name,email,password_hash,environment,is_synthetic,origin,sync_policy,external_person_id,password_enabled,active) VALUES($1,$2,$3,'disabled','test',true,'primary_import','linked',$4,false,$5)",
              [
                id,
                payload.display_name,
                randomUUID() + '@example.invalid',
                event.entity_id,
                payload.active,
              ],
            );
            await sql.query(
              "INSERT INTO directory_people(organisation_id,environment,external_person_id,user_id) VALUES($1,'test',$2,$3)",
              [client, event.entity_id, id],
            );
            user = await this.person(sql, client, event.entity_id);
          }
          requireCondition(
            user?.is_synthetic && user.origin === 'primary_import' && user.sync_policy === 'linked',
            422,
            'directory_person_conflict',
            'The person is not a linked synthetic import.',
          );
          await sql.query('UPDATE users SET name=$1,active=$2 WHERE id=$3', [
            payload.display_name,
            payload.active,
            user.id,
          ]);
          user.active = payload.active;
        } else {
          requireCondition(
            user?.is_synthetic && user.origin === 'primary_import' && user.sync_policy === 'linked',
            422,
            'directory_person_unknown',
            'Unknown linked synthetic person.',
          );
          await sql.query('UPDATE users SET active=false WHERE id=$1', [user.id]);
          user.active = false;
          const records = (
            await sql.query(
              "SELECT id,organisation_id FROM enrolments WHERE member_id=$1 AND environment='test'",
              [user.id],
            )
          ).rows;
          for (const record of records)
            await sql.query(
              "INSERT INTO approved_changes(event_id,organisation_id,environment,enrolment_id,entity_id,entity_version,kind,facts) VALUES($1,$2,'test',$3,$4,$5,'person.tombstone','{\"removed\":true}') ON CONFLICT DO NOTHING",
              [randomUUID(), record.organisation_id, record.id, user.id, event.entity_version],
            );
        }
        await sql.query(
          'UPDATE users SET directory_version=$1,permissions_synced_at=now() WHERE id=$2',
          [event.entity_version, user.id],
        );
      }
      await invalidate(sql, [user.id]);
      if (!user.active) {
        await sql.query(
          'UPDATE coordinator_allocations SET ends_at=now() WHERE ends_at IS NULL AND (member_membership_id IN (SELECT id FROM client_memberships WHERE user_id=$1) OR coordinator_membership_id IN (SELECT id FROM client_memberships WHERE user_id=$1))',
          [user.id],
        );
        await sql.query(
          'UPDATE role_assignments SET ends_at=now() WHERE user_id=$1 AND ends_at IS NULL',
          [user.id],
        );
      }
      const expired = await sql.query(
        "UPDATE client_sensitive_grants g SET ends_at=now() FROM coordinator_allocations a WHERE g.allocation_id=a.id AND g.organisation_id=$1 AND g.environment='test' AND g.ends_at IS NULL AND a.ends_at IS NOT NULL RETURNING a.coordinator_membership_id",
        [client],
      );
      if (expired.rowCount) {
        const recipients = (
          await sql.query('SELECT user_id FROM client_memberships WHERE id=ANY($1::uuid[])', [
            expired.rows.map((row) => row.coordinator_membership_id),
          ])
        ).rows;
        await invalidate(
          sql,
          recipients.map((row) => row.user_id),
        );
      }
      const appeals = (
        await sql.query(
          "SELECT id,reviewer_id,submission_attempt_id,enrolment_id FROM learning_appeals WHERE organisation_id=$1 AND environment='test' AND status='open' AND reviewer_id IS NOT NULL AND authority_ended_at IS NULL",
          [client],
        )
      ).rows;
      for (const appeal of appeals) {
        const reviewer = (
          await sql.query<AuthUser>('SELECT * FROM users WHERE id=$1', [appeal.reviewer_id])
        ).rows[0];
        const enrolment = (
          await sql.query<Enrolment>('SELECT * FROM enrolments WHERE id=$1', [appeal.enrolment_id])
        ).rows[0];
        if (
          !reviewer ||
          !(await learningAlternate(sql, reviewer, appeal.submission_attempt_id, enrolment))
        ) {
          await sql.query(
            'UPDATE learning_appeals SET authority_ended_at=now(),updated_at=now() WHERE id=$1',
            [appeal.id],
          );
          await invalidate(sql, [appeal.reviewer_id]);
        }
      }
      await sql.query(
        "INSERT INTO audit_events(id,organisation_id,environment,actor_id,action,target_id,metadata) VALUES($1,$2,'test',$3::uuid,$4,$3::text,$5)",
        [
          randomUUID(),
          client,
          user.id,
          'directory.' + event.event_type,
          JSON.stringify({ event_id: event.event_id, version: event.entity_version }),
        ],
      );
    }
    await sql.query(
      "INSERT INTO inbound_events(id,organisation_id,environment,event_id,payload_hash,entity_id,entity_version,outcome) VALUES($1,$2,'test',$3,$4,$5,$6,$7)",
      [randomUUID(), client, event.event_id, hash, event.entity_id, event.entity_version, outcome],
    );
    return outcome;
  }
}
