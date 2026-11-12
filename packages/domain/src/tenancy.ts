import { randomUUID } from 'node:crypto';
import type { Sql } from '../../database/src/database.js';
import { Auth, type AuthUser } from './auth.js';
import { Access, globalAdmin, effective, type Membership } from './access.js';
import { requireCondition } from './errors.js';

export async function invalidate(sql: Sql, ids: string[]) {
  if (!ids.length) return;
  await sql.query(
    'UPDATE users SET permission_version=permission_version+1 WHERE id=ANY($1::uuid[])',
    [ids],
  );
  await sql.query('DELETE FROM sessions WHERE user_id=ANY($1::uuid[])', [ids]);
}
function reasonValid(reason: string) {
  requireCondition(
    reason.trim().length >= 8 && reason.length <= 2000,
    422,
    'reason_required',
    'Give a reason of 8 to 2000 characters.',
  );
}
export class Tenancy {
  readonly access = new Access();
  constructor(readonly auth: Auth) {}
  async choices(token: string) {
    return this.auth.db.transaction(async (sql) => {
      const { user } = await this.auth.verified(sql, token);
      const admin = await globalAdmin(sql, user!.id, user!.environment);
      return (
        await sql.query(
          `SELECT o.id,o.name FROM organisations o JOIN platform_client_states s ON s.organisation_id=o.id
    WHERE o.active AND s.environment=$1 AND NOT s.suspended AND ($2 OR EXISTS(
     SELECT 1 FROM client_memberships cm WHERE cm.organisation_id=o.id AND cm.environment=s.environment AND cm.user_id=$3
      AND cm.status='active' AND cm.joined_at<=now() AND cm.ended_at IS NULL)) ORDER BY o.name,o.id`,
          [user!.environment, admin, user!.id],
        )
      ).rows;
    });
  }
  async select(token: string, csrf: string, client: string) {
    return this.auth.db.transaction(async (sql) => {
      const { user, session } = await this.auth.verified(sql, token, csrf);
      requireCondition(
        (await this.access.available(sql, client, user!.environment)) &&
          ((await globalAdmin(sql, user!.id, user!.environment)) ||
            (await this.access.membership(sql, user!.id, client, user!.environment))),
        404,
        'client_unavailable',
        'This client is unavailable.',
      );
      await sql.query('UPDATE sessions SET organisation_id=$1 WHERE token_hash=$2', [
        client,
        session.token_hash,
      ]);
      return { clientId: client };
    });
  }
  async mutate<T>(
    token: string,
    csrf: string,
    client: string,
    reason: string,
    work: (sql: Sql, actor: AuthUser) => Promise<T>,
  ) {
    reasonValid(reason);
    return this.auth.db.transaction(async (sql) => {
      // Serialize tenancy changes before checking the actor and target authority.
      await sql.query('SELECT id FROM organisations WHERE id=$1 FOR UPDATE', [client]);
      const { user } = await this.auth.verified(sql, token, csrf);
      requireCondition(
        await this.access.administer(sql, user!, client),
        403,
        'client_admin_required',
        'Client administration permission is required.',
      );
      const result = await work(sql, user!);
      const expired = await sql.query(
        `UPDATE client_sensitive_grants g SET ends_at=now() FROM coordinator_allocations a
    WHERE g.allocation_id=a.id AND g.organisation_id=$1 AND g.environment=$2 AND g.ends_at IS NULL AND a.ends_at IS NOT NULL RETURNING a.coordinator_membership_id`,
        [client, user!.environment],
      );
      if (expired.rowCount) {
        const recipients = await sql.query<{ user_id: string }>(
          'SELECT user_id FROM client_memberships WHERE id=ANY($1::uuid[])',
          [expired.rows.map((r) => r.coordinator_membership_id)],
        );
        await invalidate(
          sql,
          recipients.rows.map((r) => r.user_id),
        );
      }
      return result;
    });
  }
  async audit(
    sql: Sql,
    actor: AuthUser,
    client: string,
    action: string,
    target: string,
    reason: string,
  ) {
    await sql.query(
      'INSERT INTO audit_events(id,organisation_id,environment,actor_id,action,target_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [randomUUID(), client, actor.environment, actor.id, action, target, { reason }],
    );
  }
  async member(sql: Sql, client: string, environment: string, id: string) {
    const row = (
      await sql.query<Membership>(
        'SELECT * FROM client_memberships WHERE id=$1 AND organisation_id=$2 AND environment=$3',
        [id, client, environment],
      )
    ).rows[0];
    requireCondition(
      row && (await this.access.membership(sql, row.user_id, client, environment)),
      404,
      'membership_unavailable',
      'This membership is unavailable.',
    );
    return row;
  }
  async createGroup(
    token: string,
    csrf: string,
    client: string,
    name: string,
    kind: 'team' | 'cohort',
    reason: string,
  ) {
    requireCondition(
      name.trim().length > 0 && name.length <= 160 && ['team', 'cohort'].includes(kind),
      422,
      'invalid_group',
      'Enter a group name and valid type.',
    );
    return this.mutate(token, csrf, client, reason, async (sql, actor) => {
      const id = randomUUID();
      await sql.query(
        'INSERT INTO groups(id,organisation_id,environment,name,kind) VALUES($1,$2,$3,$4,$5)',
        [id, client, actor.environment, name.trim(), kind],
      );
      await this.audit(sql, actor, client, 'client.group.created', id, reason);
      return { id };
    });
  }
  async grantRole(
    token: string,
    csrf: string,
    client: string,
    memberId: string,
    role: 'admin' | 'coordinator' | 'member',
    team: string | null,
    reason: string,
  ) {
    requireCondition(
      ['admin', 'coordinator', 'member'].includes(role) && (!team || role === 'coordinator'),
      422,
      'invalid_role',
      'Choose a valid role and scope.',
    );
    return this.mutate(token, csrf, client, reason, async (sql, actor) => {
      requireCondition(
        role !== 'admin' || (await globalAdmin(sql, actor.id, actor.environment)),
        403,
        'platform_admin_required',
        'Only a Global Admin can grant client administration.',
      );
      const member = await this.member(sql, client, actor.environment, memberId);
      requireCondition(
        !team || (await this.access.team(sql, client, actor.environment, team)),
        404,
        'team_unavailable',
        'This team is unavailable.',
      );
      const key = team ? 'team:' + team : 'client:' + client;
      requireCondition(
        !(
          await sql.query(
            'SELECT id FROM role_assignments WHERE user_id=$1 AND environment=$2 AND role=$3 AND scope_key=$4 AND ends_at IS NULL',
            [member.user_id, actor.environment, role, key],
          )
        ).rowCount,
        409,
        'role_exists',
        'This role is already assigned.',
      );
      const id = randomUUID();
      await sql.query(
        'INSERT INTO role_assignments(id,user_id,role,organisation_id,environment,client_membership_id,group_id,scope_type,scope_key,granted_by,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
        [
          id,
          member.user_id,
          role,
          client,
          actor.environment,
          member.id,
          team,
          team ? 'team' : 'client',
          key,
          actor.id,
          reason,
        ],
      );
      await invalidate(sql, [member.user_id]);
      await this.audit(sql, actor, client, 'client.role.granted', id, reason);
      return { id };
    });
  }
  async revokeRole(token: string, csrf: string, client: string, id: string, reason: string) {
    return this.mutate(token, csrf, client, reason, async (sql, actor) => {
      const row = (
        await sql.query(
          'SELECT * FROM role_assignments WHERE id=$1 AND organisation_id=$2 AND environment=$3 AND ends_at IS NULL',
          [id, client, actor.environment],
        )
      ).rows[0];
      requireCondition(row, 404, 'role_unavailable', 'This role is unavailable.');
      requireCondition(
        row.role !== 'admin' || (await globalAdmin(sql, actor.id, actor.environment)),
        403,
        'platform_admin_required',
        'Only a Global Admin can remove client administration.',
      );
      await sql.query('UPDATE role_assignments SET ends_at=now() WHERE id=$1', [id]);
      if (row.role === 'coordinator')
        await sql.query(
          'UPDATE coordinator_allocations SET ends_at=now() WHERE coordinator_membership_id=$1 AND organisation_id=$2 AND environment=$3 AND ends_at IS NULL',
          [row.client_membership_id, client, actor.environment],
        );
      await invalidate(sql, [row.user_id]);
      await this.audit(sql, actor, client, 'client.role.revoked', id, reason);
      return { revoked: true };
    });
  }
  async teamMembership(
    token: string,
    csrf: string,
    client: string,
    memberId: string,
    team: string,
    join: boolean,
    reason: string,
  ) {
    return this.mutate(token, csrf, client, reason, async (sql, actor) => {
      const member = await this.member(sql, client, actor.environment, memberId);
      requireCondition(
        await this.access.team(sql, client, actor.environment, team),
        404,
        'team_unavailable',
        'This team is unavailable.',
      );
      const current = (
        await sql.query(
          'SELECT id FROM client_team_memberships WHERE client_membership_id=$1 AND group_id=$2 AND ends_at IS NULL',
          [memberId, team],
        )
      ).rows[0];
      requireCondition(
        join ? !current : current,
        409,
        'team_membership_changed',
        'Team membership has changed. Reload before trying again.',
      );
      const id = current?.id ?? randomUUID();
      if (join)
        await sql.query(
          'INSERT INTO client_team_memberships(id,organisation_id,environment,group_id,client_membership_id) VALUES($1,$2,$3,$4,$5)',
          [id, client, actor.environment, team, memberId],
        );
      else await sql.query('UPDATE client_team_memberships SET ends_at=now() WHERE id=$1', [id]);
      const viewers = await sql.query<{ user_id: string }>(
        "SELECT user_id FROM role_assignments WHERE organisation_id=$1 AND environment=$2 AND group_id=$3 AND role='coordinator' AND " +
          effective,
        [client, actor.environment, team],
      );
      await invalidate(sql, [member.user_id, ...viewers.rows.map((r) => r.user_id)]);
      await this.audit(
        sql,
        actor,
        client,
        join ? 'client.team.joined' : 'client.team.left',
        id,
        reason,
      );
      return { id };
    });
  }
  async allocate(
    token: string,
    csrf: string,
    client: string,
    memberId: string,
    coordinatorId: string,
    kind: 'primary' | 'backup',
    reason: string,
  ) {
    requireCondition(
      ['primary', 'backup'].includes(kind),
      422,
      'invalid_allocation',
      'Choose primary or backup.',
    );
    return this.mutate(token, csrf, client, reason, async (sql, actor) => {
      const member = await this.member(sql, client, actor.environment, memberId),
        coordinator = await this.member(sql, client, actor.environment, coordinatorId);
      requireCondition(
        memberId !== coordinatorId,
        403,
        'self_review',
        'A person cannot review their own training.',
      );
      requireCondition(
        await this.access.role(sql, member.user_id, client, actor.environment, 'member'),
        403,
        'member_role_required',
        'The participant needs an active member role.',
      );
      const roles = await sql.query(
        `SELECT r.id FROM role_assignments r WHERE r.client_membership_id=$1 AND r.organisation_id=$2 AND r.environment=$3 AND r.role='coordinator'
    AND r.starts_at<=now() AND (r.ends_at IS NULL OR r.ends_at>now()) AND (r.scope_type='client' OR EXISTS(SELECT 1 FROM groups g WHERE g.id=r.group_id AND g.active AND g.kind='team'))`,
        [coordinatorId, client, actor.environment],
      );
      requireCondition(
        roles.rowCount,
        403,
        'coordinator_role_required',
        'The reviewer needs an active coordinator role.',
      );
      requireCondition(
        !(
          await sql.query(
            "SELECT id FROM coordinator_allocations WHERE member_membership_id=$1 AND ends_at IS NULL AND (coordinator_membership_id=$2 OR ($3='primary' AND kind='primary'))",
            [memberId, coordinatorId, kind],
          )
        ).rowCount,
        409,
        'allocation_exists',
        'End the existing allocation before replacing it.',
      );
      const id = randomUUID();
      await sql.query(
        'INSERT INTO coordinator_allocations(id,organisation_id,environment,member_membership_id,coordinator_membership_id,kind,assigned_by,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [id, client, actor.environment, memberId, coordinatorId, kind, actor.id, reason],
      );
      await invalidate(sql, [coordinator.user_id]);
      await this.audit(sql, actor, client, 'client.allocation.created', id, reason);
      return { id };
    });
  }
  async endAllocation(token: string, csrf: string, client: string, id: string, reason: string) {
    return this.mutate(token, csrf, client, reason, async (sql, actor) => {
      const row = (
        await sql.query(
          'UPDATE coordinator_allocations SET ends_at=now() WHERE id=$1 AND organisation_id=$2 AND environment=$3 AND ends_at IS NULL RETURNING coordinator_membership_id',
          [id, client, actor.environment],
        )
      ).rows[0];
      requireCondition(row, 404, 'allocation_unavailable', 'This allocation is unavailable.');
      const recipient = (
        await sql.query('SELECT user_id FROM client_memberships WHERE id=$1', [
          row.coordinator_membership_id,
        ])
      ).rows[0];
      await invalidate(sql, [recipient.user_id]);
      await this.audit(sql, actor, client, 'client.allocation.ended', id, reason);
      return { ended: true };
    });
  }

  async leave(
    token: string,
    csrf: string,
    client: string,
    memberId: string,
    expected: number,
    reason: string,
  ) {
    return this.mutate(token, csrf, client, reason, async (sql, actor) => {
      const member = await this.member(sql, client, actor.environment, memberId);
      requireCondition(
        member.version === expected,
        409,
        'membership_changed',
        'Client membership changed. Reload before saving.',
      );
      const affected = await sql.query<{ user_id: string }>(
        `SELECT r.user_id FROM role_assignments r WHERE r.organisation_id=$1 AND r.environment=$2 AND r.role='coordinator' AND r.ends_at IS NULL
    AND r.group_id IN (SELECT group_id FROM client_team_memberships WHERE client_membership_id=$3 AND ends_at IS NULL)
    UNION SELECT cm.user_id FROM coordinator_allocations a JOIN client_memberships cm ON cm.id=a.coordinator_membership_id
    WHERE a.member_membership_id=$3 AND a.organisation_id=$1 AND a.environment=$2 AND a.ends_at IS NULL`,
        [client, actor.environment, memberId],
      );
      await sql.query(
        "UPDATE client_memberships SET status='ended',ended_at=now(),version=version+1 WHERE id=$1",
        [memberId],
      );
      await sql.query(
        'UPDATE client_team_memberships SET ends_at=now() WHERE client_membership_id=$1 AND ends_at IS NULL',
        [memberId],
      );
      await sql.query(
        'UPDATE role_assignments SET ends_at=now() WHERE client_membership_id=$1 AND ends_at IS NULL',
        [memberId],
      );
      await sql.query(
        'UPDATE coordinator_allocations SET ends_at=now() WHERE (member_membership_id=$1 OR coordinator_membership_id=$1) AND ends_at IS NULL',
        [memberId],
      );
      await invalidate(sql, [member.user_id, ...affected.rows.map((r) => r.user_id)]);
      await this.audit(sql, actor, client, 'client.membership.ended', memberId, reason);
      return { ended: true };
    });
  }
  async sensitive(
    token: string,
    csrf: string,
    client: string,
    allocationId: string,
    grant: boolean,
    reason: string,
  ) {
    return this.mutate(token, csrf, client, reason, async (sql, actor) => {
      // Platform administration alone never grants this capability.
      requireCondition(
        await this.access.role(sql, actor.id, client, actor.environment, 'admin'),
        403,
        'client_role_required',
        'An explicit Client Admin role is required.',
      );
      const allocation = (
        await sql.query(
          'SELECT * FROM coordinator_allocations WHERE id=$1 AND organisation_id=$2 AND environment=$3 AND ' +
            effective,
          [allocationId, client, actor.environment],
        )
      ).rows[0];
      requireCondition(
        allocation,
        404,
        'allocation_unavailable',
        'This allocation is unavailable.',
      );
      const recipient = await this.member(
        sql,
        client,
        actor.environment,
        allocation.coordinator_membership_id,
      );
      const member = await this.member(
        sql,
        client,
        actor.environment,
        allocation.member_membership_id,
      );
      const user = (
        await sql.query<AuthUser>(
          'SELECT id,name,email,environment,permission_version,global_admin FROM users WHERE id=$1',
          [recipient.user_id],
        )
      ).rows[0];
      if (grant)
        requireCondition(
          actor.id !== recipient.user_id && (await this.access.allocated(sql, user, member)),
          403,
          'sensitive_forbidden',
          'An eligible, separately allocated reviewer is required.',
        );
      const current = (
        await sql.query(
          'SELECT id FROM client_sensitive_grants WHERE allocation_id=$1 AND ends_at IS NULL',
          [allocationId],
        )
      ).rows[0];
      requireCondition(
        grant ? !current : current,
        409,
        'sensitive_changed',
        'Sensitive access has changed. Reload before trying again.',
      );
      const id = current?.id ?? randomUUID();
      if (grant)
        await sql.query(
          'INSERT INTO client_sensitive_grants(id,organisation_id,environment,allocation_id,granted_by,reason) VALUES($1,$2,$3,$4,$5,$6)',
          [id, client, actor.environment, allocationId, actor.id, reason],
        );
      else await sql.query('UPDATE client_sensitive_grants SET ends_at=now() WHERE id=$1', [id]);
      await invalidate(sql, [recipient.user_id]);
      await this.audit(
        sql,
        actor,
        client,
        grant ? 'client.sensitive.granted' : 'client.sensitive.revoked',
        id,
        reason,
      );
      return { id };
    });
  }
}
