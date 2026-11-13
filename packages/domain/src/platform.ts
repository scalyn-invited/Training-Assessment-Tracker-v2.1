import { randomUUID } from 'node:crypto';
import type { Sql } from '../../database/src/database.js';
import { Auth, type AuthUser } from './auth.js';
import { Access, globalAdmin, effective } from './access.js';
import { invalidate, Tenancy } from './tenancy.js';
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
  async history(
    token: string,
    filters: {
      action?: string;
      query?: string;
      target?: string;
      actor?: string;
      from?: string;
      to?: string;
      page?: number;
    } = {},
  ) {
    const {
      action = '',
      query = '',
      target = '',
      actor = '',
      from = '',
      to = '',
      page = 1,
    } = filters;
    const date = (value: string) =>
      !value ||
      (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
        !Number.isNaN(Date.parse(value)) &&
        new Date(value).toISOString().slice(0, 10) === value);
    requireCondition(
      action.length <= 120 &&
        query.length <= 120 &&
        target.length <= 80 &&
        actor.length <= 120 &&
        Number.isInteger(page) &&
        page >= 1 &&
        page <= 100000 &&
        date(from) &&
        date(to) &&
        (!from || !to || from <= to),
      422,
      'invalid_audit_filter',
      'Choose valid filters and an ordered UTC date range.',
    );
    return this.transaction(token, undefined, async (sql, user) => {
      const where = `e.environment=$1 AND ($2='' OR e.action=$2) AND ($3='' OR e.reason ILIKE '%'||$3||'%' OR e.target_id ILIKE '%'||$3||'%')
        AND ($4='' OR e.target_id=$4) AND ($5='' OR u.name ILIKE '%'||$5||'%')
        AND (NULLIF($6,'')::date IS NULL OR e.created_at>=NULLIF($6,'')::date::timestamp AT TIME ZONE 'UTC')
        AND (NULLIF($7,'')::date IS NULL OR e.created_at<(NULLIF($7,'')::date+1)::timestamp AT TIME ZONE 'UTC')`;
      const params = [user.environment, action, query, target, actor, from, to];
      const events = (
        await sql.query(
          `SELECT e.id,e.action,e.target_id,e.reason,e.changes,e.created_at,e.operator_reference,u.name actor_name
        FROM platform_audit_events e LEFT JOIN users u ON u.id=e.actor_id WHERE ${where}
        ORDER BY e.created_at DESC,e.id DESC LIMIT 25 OFFSET $8`,
          [...params, (page - 1) * 25],
        )
      ).rows;
      const total = (
        await sql.query(
          `SELECT count(*)::int total FROM platform_audit_events e LEFT JOIN users u ON u.id=e.actor_id WHERE ${where}`,
          params,
        )
      ).rows[0].total;
      const actions = (
        await sql.query<{ action: string }>(
          'SELECT DISTINCT action FROM platform_audit_events WHERE environment=$1 ORDER BY action',
          [user.environment],
        )
      ).rows.map((row) => row.action);

      // Match the source presentation allowlist: audit internals and future secret fields
      // must never become browser-visible merely because they were recorded.
      for (const event of events) {
        const raw = event.changes ?? {};
        const safe: Record<string, unknown> = {};
        const scalar = (value: unknown) =>
          value === null || ['string', 'number', 'boolean'].includes(typeof value);
        for (const key of ['name', 'suspended']) {
          for (const side of ['before', 'after']) {
            const value = raw[side]?.[key];
            if (value !== undefined && scalar(value)) safe[key] ??= {} as Record<string, unknown>;
            if (value !== undefined && scalar(value))
              (safe[key] as Record<string, unknown>)[side] = value;
          }
        }
        for (const key of [
          'name',
          'suspended',
          'display_name',
          'app_name',
          'accent',
          'default_theme',
          'logo_changed',
        ]) {
          if (!(key in raw)) continue;
          const value = raw[key];
          if (scalar(value)) safe[key] = value;
          else if (value && typeof value === 'object')
            safe[key] = Object.fromEntries(
              Object.entries(value).filter(
                ([side, item]) => ['before', 'after'].includes(side) && scalar(item),
              ),
            );
        }
        event.changes = safe;
      }

      return { events, total, actions, page };
    });
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
      const filter = `s.environment=$1 AND o.name ILIKE $2 AND ($3='' OR ($3='suspended' AND s.suspended) OR ($3='active' AND NOT s.suspended AND o.active) OR ($3='inactive' AND NOT o.active))`;
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
  async overview(token: string) {
    return this.transaction(token, undefined, async (sql, actor) => {
      const clients = (
        await sql.query(
          'SELECT count(*)::int total FROM platform_client_states WHERE environment=$1',
          [actor.environment],
        )
      ).rows[0].total;
      const grants = (
        await sql.query(
          "SELECT user_id FROM role_assignments WHERE environment=$1 AND role='admin' AND scope_type='platform' AND " +
            effective,
          [actor.environment],
        )
      ).rows;
      let activeAdmins = 0;
      for (const id of new Set(grants.map((row) => row.user_id)))
        if (await this.access.active(sql, id, actor.environment)) activeAdmins++;
      return {
        clients,
        activeAdmins,
        assignments: grants.length,
        identityMode:
          (process.env.TRAINING_AUTH_MODE ?? 'local_password') === 'local_password'
            ? 'local_password'
            : process.env.MOCK_IDENTITY_ENABLED === 'true' &&
                process.env.TRAINING_AUTH_MODE === 'mock' &&
                process.env.TRAINING_ENVIRONMENT === 'test' &&
                actor.environment === 'test'
              ? 'mock'
              : 'unavailable',
        emailConfigured: process.env.SMTP_ENABLED === 'true',
        aiConfigured: process.env.AI_LIVE_ENABLED === 'true',
      };
    });
  }
  async administrators(token: string, search = '', page = 1, adminsPage = 1) {
    requireCondition(
      search.length <= 120 &&
        [page, adminsPage].every((n) => Number.isInteger(n) && n >= 1 && n <= 100000),
      422,
      'invalid_filter',
      'Enter a valid search or page.',
    );
    return this.transaction(token, undefined, async (sql, actor) => {
      const active =
        "u.active AND NOT(u.environment='production' AND u.is_synthetic) AND (u.origin<>'primary_import' OR u.permissions_synced_at>=now()-interval '5 minutes') AND EXISTS(SELECT 1 FROM identities i WHERE i.user_id=u.id AND i.active)";
      const grant =
        "r.environment=$1 AND r.role='admin' AND r.scope_type='platform' AND r.starts_at<=now() AND (r.ends_at IS NULL OR r.ends_at>now())";
      const admins = (
        await sql.query(
          `SELECT r.id,r.user_id,u.name,u.email,(${active}) active FROM role_assignments r JOIN users u ON u.id=r.user_id AND u.environment=r.environment WHERE ${grant} ORDER BY u.name,r.id LIMIT 20 OFFSET $2`,
          [actor.environment, (adminsPage - 1) * 20],
        )
      ).rows;
      const counts = (
        await sql.query(
          `SELECT count(*)::int total,count(DISTINCT u.id) FILTER(WHERE ${active})::int active FROM role_assignments r JOIN users u ON u.id=r.user_id AND u.environment=r.environment WHERE ${grant}`,
          [actor.environment],
        )
      ).rows[0];
      const where = `u.environment=$1 AND ${active} AND (u.name ILIKE '%'||$2||'%' OR u.email ILIKE '%'||$2||'%')`;
      const accounts = (
        await sql.query(
          `SELECT u.id,u.name,u.email,u.permission_version,EXISTS(SELECT 1 FROM role_assignments r WHERE r.user_id=u.id AND ${grant}) global_admin FROM users u WHERE ${where} ORDER BY u.name,u.id LIMIT 20 OFFSET $3`,
          [actor.environment, search, (page - 1) * 20],
        )
      ).rows;
      const total = (
        await sql.query(`SELECT count(*)::int total FROM users u WHERE ${where}`, [
          actor.environment,
          search,
        ])
      ).rows[0].total;
      return {
        admins,
        adminTotal: counts.total,
        activeAdmins: counts.active,
        accounts,
        total,
        page,
        adminsPage,
      };
    });
  }
  async clientAccounts(token: string, search = '', page = 1) {
    requireCondition(search.length <= 120 && Number.isInteger(page) && page >= 1 && page <= 100000,
      422, 'invalid_filter', 'Enter a valid account search or page.');
    return this.transaction(token, undefined, async (sql, actor) => {
      const where = `u.environment=$1 AND u.active AND NOT(u.environment='production' AND u.is_synthetic)
        AND EXISTS(SELECT 1 FROM identities i WHERE i.user_id=u.id AND i.active)
        AND (u.name ILIKE '%'||$2||'%' OR u.email ILIKE '%'||$2||'%')`;
      const accounts = (await sql.query(`SELECT u.id,u.name,u.email,u.permission_version FROM users u WHERE ${where} ORDER BY u.name,u.id LIMIT 20 OFFSET $3`, [actor.environment,search,(page-1)*20])).rows;
      const total = (await sql.query(`SELECT count(*)::int total FROM users u WHERE ${where}`, [actor.environment,search])).rows[0].total;
      const clients = (await sql.query(`SELECT o.id,o.name FROM organisations o JOIN platform_client_states s ON s.organisation_id=o.id WHERE s.environment=$1 AND o.active AND NOT s.suspended ORDER BY o.name,o.id`,[actor.environment])).rows;
      const memberships = (await sql.query(`SELECT cm.user_id,cm.organisation_id,o.name FROM client_memberships cm JOIN organisations o ON o.id=cm.organisation_id JOIN platform_client_states s ON s.organisation_id=o.id AND s.environment=cm.environment
        WHERE cm.environment=$1 AND cm.user_id=ANY($2::uuid[]) AND cm.status='active' AND cm.ended_at IS NULL AND cm.joined_at<=now() AND o.active AND NOT s.suspended ORDER BY o.name,o.id`,[actor.environment,accounts.map(a=>a.id)])).rows;
      const roles = (await sql.query(`SELECT user_id,organisation_id,role FROM role_assignments WHERE environment=$1 AND user_id=ANY($2::uuid[]) AND scope_type='client' AND ${effective}`,[actor.environment,accounts.map(a=>a.id)])).rows;
      return { accounts: accounts.map(account => {
        const current=memberships.filter(m=>m.user_id===account.id);
        return {...account,memberships:current.map(m=>({id:m.organisation_id,name:m.name})),
          roles:roles.filter(r=>r.user_id===account.id).map(r=>({clientId:r.organisation_id,role:r.role})),
          defaultClientId:current.length===1 ? current[0].organisation_id : ''};
      }), clients, total, page, allowJoin:(process.env.TRAINING_AUTH_MODE ?? 'local_password') !== 'local_password' };
    });
  }
  async clientRole(token: string, csrf: string, client: string, userId: string,
    action: 'join' | 'grant' | 'revoke', expectedVersion: number, reason: string) {
    this.reason(reason);
    requireCondition(['join', 'grant', 'revoke'].includes(action) && Number.isInteger(expectedVersion) && expectedVersion > 0,
      422, 'invalid_account_action', 'Choose an account action and reload its current version.');
    requireCondition(action !== 'join' || (process.env.TRAINING_AUTH_MODE ?? 'local_password') !== 'local_password',
      409, 'invitation_required', 'Use an invitation so the account owner can accept access.');
    return this.transaction(token, csrf, async (sql, actor) => {
      await sql.query('SELECT id FROM organisations WHERE id=$1 FOR UPDATE', [client]);
      requireCondition(await this.access.available(sql, client, actor.environment), 404, 'client_unavailable', 'This client is unavailable.');
      const target = (await sql.query('SELECT permission_version FROM users WHERE id=$1 AND environment=$2 FOR UPDATE', [userId, actor.environment])).rows[0];
      requireCondition(await this.access.active(sql, userId, actor.environment), 404, 'account_unavailable', 'This account is unavailable.');
      requireCondition(target?.permission_version === expectedVersion, 409, 'account_version_conflict',
        'This account changed. Reload accounts and review access again.');
      const tenancy = new Tenancy(this.auth);
      if (action === 'join') {
        const previous = (await sql.query('SELECT id,status FROM client_memberships WHERE organisation_id=$1 AND environment=$2 AND user_id=$3', [client, actor.environment, userId])).rows[0];
        requireCondition(!previous || previous.status === 'ended', 409, 'membership_exists', 'Client membership already exists.');
        const id = previous?.id ?? randomUUID();
        if (previous) await sql.query("UPDATE client_memberships SET status='active',joined_at=now(),ended_at=NULL,version=version+1 WHERE id=$1", [id]);
        else await sql.query('INSERT INTO client_memberships(id,organisation_id,environment,user_id) VALUES($1,$2,$3,$4)', [id,client,actor.environment,userId]);
        await tenancy.audit(sql,actor,client,'membership.joined',id,reason);
      } else {
        const member = await this.access.membership(sql,userId,client,actor.environment);
        requireCondition(member,422,'client_membership_required',
          (process.env.TRAINING_AUTH_MODE ?? 'local_password') === 'local_password'
            ? 'This account is not an active member of the selected client. Invite the account and wait for acceptance before granting Client Admin.'
            : 'This account is not an active member of the selected client. Choose its current client, or explicitly join the account first.');
        const current = (await sql.query("SELECT id FROM role_assignments WHERE user_id=$1 AND organisation_id=$2 AND environment=$3 AND role='admin' AND scope_type='client' AND ends_at IS NULL", [userId,client,actor.environment])).rows[0];
        requireCondition(action === 'grant' ? !current : current,409,'client_role_changed','Client Admin access changed. Reload accounts and review it again.');
        const id = current?.id ?? randomUUID();
        if (action === 'grant') await sql.query("INSERT INTO role_assignments(id,user_id,role,organisation_id,environment,client_membership_id,scope_type,scope_key,granted_by,reason) VALUES($1,$2,'admin',$3,$4,$5,'client',$6,$7,$8)",
          [id,userId,client,actor.environment,member!.id,'client:'+client,actor.id,reason]);
        else await sql.query('UPDATE role_assignments SET ends_at=now() WHERE id=$1',[id]);
        await tenancy.audit(sql,actor,client,action === 'grant' ? 'client.role.granted' : 'client.role.revoked',id,reason);
      }
      await invalidate(sql,[userId]);
      await this.audit(sql,actor,'platform.client.account.'+action,client,reason,{user_id:userId});
      return { updated: true };
    });
  }
  async appoint(
    token: string,
    csrf: string,
    userId: string,
    reason: string,
    expectedVersion: number,
  ) {
    this.reason(reason);
    requireCondition(
      Number.isInteger(expectedVersion) && expectedVersion > 0,
      422,
      'account_version_required',
      'Reload accounts before appointing a Global Admin.',
    );
    return this.transaction(token, csrf, async (sql, actor) => {
      const target = (
        await sql.query<{ permission_version: number }>(
          'SELECT permission_version FROM users WHERE id=$1 AND environment=$2 FOR UPDATE',
          [userId, actor.environment],
        )
      ).rows[0];
      requireCondition(
        await this.access.active(sql, userId, actor.environment),
        404,
        'account_unavailable',
        'This account is unavailable.',
      );
      requireCondition(
        target?.permission_version === expectedVersion,
        409,
        'account_version_conflict',
        'This account changed. Reload accounts and review access again.',
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
        await sql.query(
          "UPDATE document_extractions SET status='failed',error_code='access_revoked',version=version+1,updated_at=now() WHERE organisation_id=$1 AND environment=$2 AND status IN ('waiting_scan','queued','running')",
          [id, actor.environment],
        );
        // Retain reservations only for calls that may already have reached a provider.
        await sql.query(
          "UPDATE ai_runs r SET status=CASE WHEN EXISTS(SELECT 1 FROM ai_blocks b WHERE b.ai_run_id=r.id AND b.status='running') THEN 'ambiguous' ELSE 'cancelled' END,reserved=CASE WHEN EXISTS(SELECT 1 FROM ai_blocks b WHERE b.ai_run_id=r.id AND b.status='running') THEN r.reserved ELSE 0 END,message='Client suspended. Explicit review is required.',updated_at=now() WHERE r.organisation_id=$1 AND r.environment=$2 AND r.status IN ('queued','running')",
          [id, actor.environment],
        );
        await sql.query(
          "UPDATE ai_attempts SET status='ambiguous',updated_at=now() WHERE organisation_id=$1 AND environment=$2 AND status='running'",
          [id, actor.environment],
        );
        await sql.query(
          "UPDATE ai_blocks SET status=CASE WHEN status='running' THEN 'ambiguous' ELSE 'cancelled' END,updated_at=now() WHERE organisation_id=$1 AND environment=$2 AND status IN ('queued','running')",
          [id, actor.environment],
        );
        await sql.query(
          "UPDATE assessment_reviews r SET status='technical_failure',updated_at=now() WHERE r.organisation_id=$1 AND r.environment=$2 AND r.status='queued' AND EXISTS(SELECT 1 FROM ai_runs a WHERE a.subject_id=r.id AND a.task='assess_initial' AND a.status IN ('ambiguous','cancelled'))",
          [id, actor.environment],
        );
        await sql.query(
          "UPDATE assessment_assignments a SET status='technical_failure',version=version+1,updated_at=now() WHERE a.organisation_id=$1 AND a.environment=$2 AND a.status='queued' AND EXISTS(SELECT 1 FROM assessment_reviews r WHERE r.assignment_id=a.id AND r.status='technical_failure')",
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
