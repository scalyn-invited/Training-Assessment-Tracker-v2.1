import { z } from 'zod';
import type { Sql } from '../../database/src/database.js';
import type { AuthUser } from './auth.js';
import { Access, globalAdmin } from './access.js';
import type { Enrolment } from './enrolments.js';
import { requireCondition } from './errors.js';

export class ApprovedFeed {
  private readonly access = new Access();
  async client(sql: Sql, actor: AuthUser, client: string) {
    z.uuid().parse(client);
    const current = (
      await sql.query(
        'SELECT origin,permissions_synced_at,permission_version FROM users WHERE id=$1 AND environment=$2',
        [actor.id, actor.environment],
      )
    ).rows[0];
    requireCondition(
      current && current.permission_version === actor.permission_version,
      401,
      'invalid_identity',
      'The delegated identity is unavailable.',
    );
    requireCondition(
      current.origin !== 'primary_import' ||
        (current.permissions_synced_at &&
          new Date(current.permissions_synced_at).getTime() >= Date.now() - 300000),
      503,
      'permissions_stale',
      'Permissions are stale.',
    );
    requireCondition(
      await this.access.active(sql, actor.id, actor.environment),
      401,
      'invalid_identity',
      'The delegated identity is unavailable.',
    );
    requireCondition(
      (await this.access.available(sql, client, actor.environment)) &&
        ((await globalAdmin(sql, actor.id, actor.environment)) ||
          (await this.access.membership(sql, actor.id, client, actor.environment))),
      404,
      'client_unavailable',
      'This client is unavailable.',
    );
  }
  private async visible(sql: Sql, actor: AuthUser, client: string) {
    await this.client(sql, actor, client);
    const rows = (
      await sql.query<
        Enrolment & {
          sync_policy: string;
          external_person_id: string | null;
          is_synthetic: boolean;
          linked_at: Date | null;
          export_training_history: boolean;
        }
      >(
        `SELECT e.*,u.sync_policy,u.external_person_id,u.is_synthetic,u.linked_at,u.export_training_history
       FROM enrolments e JOIN users u ON u.id=e.member_id AND u.environment=e.environment
       WHERE e.organisation_id=$1 AND e.environment=$2 AND e.status<>'onboarding'`,
        [client, actor.environment],
      )
    ).rows;
    const visible: typeof rows = [];
    for (const row of rows)
      if (
        await this.access.viewTraining(
          sql,
          actor,
          row.member_membership_id,
          row.group_id,
          row.created_at,
        )
      )
        visible.push(row);
    return visible;
  }
  private external(row: {
    sync_policy: string;
    external_person_id: string | null;
    is_synthetic: boolean;
    environment: string;
  }) {
    return (
      row.sync_policy === 'linked' &&
      row.external_person_id !== null &&
      !row.is_synthetic &&
      row.environment === 'production'
    );
  }
  async summary(sql: Sql, actor: AuthUser, client: string, memberId?: string) {
    if (memberId) z.uuid().parse(memberId);
    const rows = await this.visible(sql, actor, client);
    requireCondition(
      !memberId || rows.some((row) => row.member_id === memberId),
      404,
      'member_unavailable',
      'This member record is unavailable.',
    );
    return {
      items: rows
        .filter((row) => row.member_id === (memberId ?? actor.id) && this.external(row))
        .map((row) => ({ enrolment_id: row.id })),
      next_cursor: null,
      data_as_of: new Date().toISOString(),
    };
  }
  async read(sql: Sql, actor: AuthUser, client: string, after = 0, limit = 50) {
    z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).parse(after);
    z.number().int().min(1).max(100).parse(limit);
    const rows = (await this.visible(sql, actor, client)).filter((row) => this.external(row));
    const eligible = new Map(rows.map((row) => [row.id, row]));
    const changes = rows.length
      ? (
          await sql.query<{
            sequence: string;
            event_id: string;
            enrolment_id: string;
            entity_id: string;
            entity_version: number;
            kind: string;
            facts: unknown;
            created_at: Date;
          }>(
            `SELECT c.* FROM approved_changes c JOIN users u ON u.id=(SELECT e.member_id FROM enrolments e WHERE e.id=c.enrolment_id)
      WHERE c.organisation_id=$1 AND c.environment=$2 AND c.enrolment_id=ANY($3::uuid[]) AND c.sequence>$4
      AND (u.export_training_history OR (u.linked_at IS NOT NULL AND c.created_at>=u.linked_at)) ORDER BY c.sequence LIMIT $5`,
            [client, actor.environment, [...eligible.keys()], after, limit],
          )
        ).rows
      : [];
    return {
      items: changes.map((row) => ({
        event_id: row.event_id,
        enrolment_id: row.enrolment_id,
        entity_id: row.entity_id,
        version: row.entity_version,
        kind: row.kind,
        facts: row.facts,
        approved_at: row.created_at,
      })),
      next_cursor: changes.length ? Number(changes.at(-1)!.sequence) : after,
      data_as_of: new Date().toISOString(),
      permission_version: actor.permission_version,
    };
  }
}
