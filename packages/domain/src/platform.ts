import { randomUUID } from 'node:crypto';
import type { Sql } from '../../database/src/database.js';
import { Auth, type AuthUser } from './auth.js';
import { Access, globalAdmin, effective } from './access.js';
import { invalidate } from './tenancy.js';
import { requireCondition } from './errors.js';
export class Platform {
  readonly access = new Access();
  constructor(readonly auth: Auth) {}
  async transaction<T>(
    token: string,
    csrf: string | undefined,
    work: (sql: Sql, actor: AuthUser) => Promise<T>,
  ) {
    return this.auth.db.transaction(async (sql) => {
      // Every platform mutation shares the same environment lock, including last-admin checks.
      const environment = process.env.NODE_ENV === 'production' ? 'production' : 'test';
      await sql.query('SELECT environment FROM platform_settings WHERE environment=$1 FOR UPDATE', [
        environment,
      ]);
      const { user } = await this.auth.verified(sql, token, csrf);
      requireCondition(
        user && (await globalAdmin(sql, user.id, user.environment)),
        403,
        'platform_admin_required',
        'Global Admin access is required.',
      );
      return work(sql, user!);
    });
  }
  reason(value: string) {
    requireCondition(
      value.trim().length >= 8 && value.length <= 2000,
      422,
      'reason_required',
      'Give a reason of 8 to 2000 characters.',
    );
  }
  async audit(
    sql: Sql,
    actor: AuthUser,
    action: string,
    target: string,
    reason: string,
    changes: unknown,
  ) {
    await sql.query(
      'INSERT INTO platform_audit_events(id,environment,actor_id,action,target_id,reason,changes) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [randomUUID(), actor.environment, actor.id, action, target, reason, changes],
    );
  }
  async directory(token: string, search = '', page = 1, status = '', sort = 'asc') {
    requireCondition(
      search.length <= 120 &&
        Number.isInteger(page) &&
        page >= 1 &&
        ['', 'active', 'suspended', 'inactive'].includes(status) &&
        ['asc', 'desc'].includes(sort),
      422,
      'invalid_filter',
      'Enter a valid search or page.',
    );
    return this.transaction(token, undefined, async (sql, actor) => {
      const filter = `s.environment=$1 AND o.name ILIKE $2 AND ($3='' OR ($3='suspended' AND s.suspended) OR ($3='active' AND NOT s.suspended AND o.active) OR ($3='inactive' AND NOT s.suspended AND NOT o.active))`;
      const eligible = `cm.organisation_id=o.id AND cm.environment=s.environment AND cm.status='active' AND cm.ended_at IS NULL AND cm.joined_at<=now()
     AND u.active AND u.environment=s.environment AND NOT(u.environment='production' AND u.is_synthetic)
     AND (u.origin<>'primary_import' OR u.permissions_synced_at>=now()-interval '5 minutes')
     AND EXISTS(SELECT 1 FROM identities i WHERE i.user_id=u.id AND i.active)`;
      const clients = await sql.query(
        `SELECT o.id,o.name,o.active,s.suspended,s.version,
    CASE WHEN o.active AND NOT s.suspended THEN (SELECT count(*)::int FROM client_memberships cm JOIN users u ON u.id=cm.user_id WHERE ${eligible}) ELSE 0 END members,
    CASE WHEN o.active AND NOT s.suspended THEN (SELECT count(DISTINCT u.id)::int FROM client_memberships cm JOIN users u ON u.id=cm.user_id JOIN role_assignments r ON r.client_membership_id=cm.id
      WHERE ${eligible} AND r.role='admin' AND r.scope_type='client' AND r.environment=s.environment AND r.organisation_id=o.id AND r.starts_at<=now() AND (r.ends_at IS NULL OR r.ends_at>now())) ELSE 0 END admins
    FROM organisations o JOIN platform_client_states s ON s.organisation_id=o.id
    WHERE ${filter} ORDER BY o.name ${sort === 'desc' ? 'DESC' : 'ASC'},o.id LIMIT 20 OFFSET $4`,
        [actor.environment, '%' + search + '%', status, (page - 1) * 20],
      );
      const total = (
        await sql.query(
          `SELECT count(*)::int total FROM organisations o JOIN platform_client_states s ON s.organisation_id=o.id WHERE ${filter}`,
          [actor.environment, '%' + search + '%', status],
        )
      ).rows[0].total;
      const all = (
        await sql.query(
          'SELECT count(*)::int total FROM platform_client_states WHERE environment=$1',
          [actor.environment],
        )
      ).rows[0].total;
      return { clients: clients.rows, total, all, page };
    });
  }
  async appoint(token: string, csrf: string, userId: string, reason: string) {
    this.reason(reason);
    return this.transaction(token, csrf, async (sql, actor) => {
      requireCondition(
        await this.access.active(sql, userId, actor.environment),
        404,
        'account_unavailable',
        'This account is unavailable.',
      );
      const existing = (
        await sql.query(
          "SELECT id FROM role_assignments WHERE user_id=$1 AND environment=$2 AND scope_type='platform' AND role='admin' AND " +
            effective,
          [userId, actor.environment],
        )
      ).rows[0];
      if (existing) return { id: existing.id };
      const id = randomUUID();
      await sql.query(
        "INSERT INTO role_assignments(id,user_id,role,environment,scope_type,scope_key,granted_by,reason) VALUES($1,$2,'admin',$3,'platform','platform',$4,$5)",
        [id, userId, actor.environment, actor.id, reason],
      );
      await invalidate(sql, [userId]);
      await this.audit(sql, actor, 'platform.admin.appointed', userId, reason, { grant_id: id });
      return { id };
    });
  }
  async revoke(token: string, csrf: string, grantId: string, reason: string) {
    this.reason(reason);
    return this.transaction(token, csrf, async (sql, actor) => {
      const grant = (
        await sql.query(
          "SELECT * FROM role_assignments WHERE id=$1 AND environment=$2 AND role='admin' AND scope_type='platform' AND " +
            effective,
          [grantId, actor.environment],
        )
      ).rows[0];
      requireCondition(grant, 404, 'grant_unavailable', 'This administrator grant is unavailable.');
      const others = await sql.query<{ user_id: string }>(
        "SELECT DISTINCT user_id FROM role_assignments WHERE id<>$1 AND environment=$2 AND role='admin' AND scope_type='platform' AND " +
          effective,
        [grantId, actor.environment],
      );
      let active = 0;
      for (const candidate of others.rows)
        if (await this.access.active(sql, candidate.user_id, actor.environment)) active++;
      requireCondition(
        active > 0,
        409,
        'last_administrator',
        'Appoint another active Global Admin before removing this administrator.',
      );
      await sql.query('UPDATE role_assignments SET ends_at=now() WHERE id=$1', [grantId]);
      await invalidate(sql, [grant.user_id]);
      await this.audit(sql, actor, 'platform.admin.revoked', grant.user_id, reason, {
        grant_id: grantId,
      });
      return { revoked: true };
    });
  }
  async client(
    token: string,
    csrf: string,
    id: string | null,
    name: string,
    expected: number,
    reason: string,
    suspended?: boolean,
  ) {
    this.reason(reason);
    requireCondition(
      name.trim().length > 0 && name.length <= 160 && Number.isInteger(expected) && expected >= 0,
      422,
      'invalid_client',
      'Enter a client name and current version.',
    );
    return this.transaction(token, csrf, async (sql, actor) => {
      const creating = id === null;
      let row: any;
      if (id) {
        row = (
          await sql.query(
            'SELECT o.id,o.name,s.version,s.suspended FROM organisations o JOIN platform_client_states s ON s.organisation_id=o.id WHERE o.id=$1 AND s.environment=$2 FOR UPDATE',
            [id, actor.environment],
          )
        ).rows[0];
        requireCondition(row, 404, 'client_unavailable', 'This client is unavailable.');
      } else {
        requireCondition(
          expected === 0,
          409,
          'client_changed',
          'Client changed. Reload before saving.',
        );
        id = randomUUID();
        row = { id, name: name.trim(), version: 0, suspended: false };
        await sql.query('INSERT INTO organisations(id,name) VALUES($1,$2)', [id, name.trim()]);
        await sql.query(
          'INSERT INTO platform_client_states(organisation_id,environment) VALUES($1,$2)',
          [id, actor.environment],
        );
      }
      requireCondition(
        row.version === expected,
        409,
        'client_changed',
        'Client changed. Reload before saving.',
      );
      if (row.name !== name.trim()) {
        requireCondition(
          !(
            await sql.query(
              'SELECT id FROM client_memberships WHERE organisation_id=$1 AND environment<>$2 LIMIT 1',
              [id, actor.environment],
            )
          ).rowCount,
          409,
          'shared_directory',
          'This directory name is shared across environments.',
        );
      }
      const value = suspended ?? row.suspended;
      await sql.query('UPDATE organisations SET name=$1 WHERE id=$2', [name.trim(), id]);
      await sql.query(
        'UPDATE platform_client_states SET suspended=$1,version=version+1 WHERE organisation_id=$2 AND environment=$3',
        [value, id, actor.environment],
      );
      if (value && !row.suspended) {
        const members = await sql.query<{ user_id: string }>(
          'SELECT user_id FROM client_memberships WHERE organisation_id=$1 AND environment=$2',
          [id, actor.environment],
        );
        await invalidate(
          sql,
          members.rows.map((m) => m.user_id),
        );
        await sql.query('UPDATE sessions SET organisation_id=NULL WHERE organisation_id=$1', [id]);
        await sql.query(
          'UPDATE client_sensitive_grants SET ends_at=now() WHERE organisation_id=$1 AND environment=$2 AND ends_at IS NULL',
          [id, actor.environment],
        );
        // An in-flight external effect is uncertain, never automatically retried after reactivation.
        await sql.query(
          "UPDATE outbox_events SET status=CASE WHEN status='processing' THEN 'uncertain' ELSE 'failed' END,last_error='client_suspended',lease_token=NULL,lease_until=NULL,updated_at=now() WHERE organisation_id=$1 AND environment=$2 AND status IN ('pending','processing')",
          [id, actor.environment],
        );
      }
      await this.audit(
        sql,
        actor,
        creating ? 'platform.client.created' : 'platform.client.updated',
        id!,
        reason,
        {
          before: { name: row.name, suspended: row.suspended },
          after: { name: name.trim(), suspended: value },
        },
      );
      return { id, version: expected + 1 };
    });
  }
}
