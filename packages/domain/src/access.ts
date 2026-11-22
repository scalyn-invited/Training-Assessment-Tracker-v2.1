import type { Sql } from '../../database/src/database.js';
import type { AuthUser } from './auth.js';
import { requireCondition } from './errors.js';
export type Membership = {
  id: string;
  organisation_id: string;
  environment: 'test' | 'production';
  user_id: string;
  version: number;
  joined_at: Date;
};
export const effective = 'starts_at<=now() AND (ends_at IS NULL OR ends_at>now())';
export async function globalAdmin(sql: Sql, userId: string, environment: string): Promise<boolean> {
  return Boolean(
    (
      await sql.query(
        "SELECT id FROM role_assignments WHERE user_id=$1 AND environment=$2 AND role='admin' AND scope_type='platform' AND " +
          effective,
        [userId, environment],
      )
    ).rowCount,
  );
}
export class Access {
  async active(sql: Sql, userId: string, environment: string) {
    return Boolean(
      (
        await sql.query(
          `SELECT u.id FROM users u WHERE u.id=$1 AND u.environment=$2 AND u.active
   AND NOT (u.environment='production' AND u.is_synthetic)
   AND (u.origin<>'primary_import' OR u.permissions_synced_at>=now()-interval '5 minutes')
   AND EXISTS(SELECT 1 FROM identities i WHERE i.user_id=u.id AND i.active)`,
          [userId, environment],
        )
      ).rowCount,
    );
  }
  async available(sql: Sql, client: string, environment: string) {
    return Boolean(
      (
        await sql.query(
          'SELECT o.id FROM organisations o JOIN platform_client_states s ON s.organisation_id=o.id WHERE o.id=$1 AND o.active AND s.environment=$2 AND NOT s.suspended',
          [client, environment],
        )
      ).rowCount,
    );
  }
  async membership(
    sql: Sql,
    userId: string,
    client: string,
    environment: string,
  ): Promise<Membership | undefined> {
    // Recheck all gates in one statement, not three network round trips per call.
    // No decision is cached: later calls still observe revocation and client changes.
    return (
      await sql.query<Membership>(
        `SELECT cm.* FROM client_memberships cm
         JOIN users u ON u.id=cm.user_id AND u.environment=cm.environment
         JOIN organisations o ON o.id=cm.organisation_id
         JOIN platform_client_states s ON s.organisation_id=o.id AND s.environment=cm.environment
         WHERE cm.user_id=$1 AND cm.organisation_id=$2 AND cm.environment=$3
           AND cm.status='active' AND cm.joined_at<=now() AND cm.ended_at IS NULL
           AND u.active AND NOT (u.environment='production' AND u.is_synthetic)
           AND (u.origin<>'primary_import' OR u.permissions_synced_at>=now()-interval '5 minutes')
           AND EXISTS(SELECT 1 FROM identities i WHERE i.user_id=u.id AND i.active)
           AND o.active AND NOT s.suspended`,
        [userId, client, environment],
      )
    ).rows[0];
  }
  async role(
    sql: Sql,
    userId: string,
    client: string,
    environment: string,
    role: string,
    team: string | null = null,
  ) {
    const member = await this.membership(sql, userId, client, environment);
    if (!member) return false;
    if (team && !(await this.team(sql, client, environment, team))) return false;
    return Boolean(
      (
        await sql.query(
          `SELECT id FROM role_assignments WHERE user_id=$1 AND organisation_id=$2 AND environment=$3 AND client_membership_id=$4
   AND role=$5 AND scope_type=$6 AND group_id IS NOT DISTINCT FROM $7::uuid AND ` + effective,
          [userId, client, environment, member.id, role, team ? 'team' : 'client', team],
        )
      ).rowCount,
    );
  }
  async administer(sql: Sql, actor: AuthUser, client: string) {
    return (
      (await this.active(sql, actor.id, actor.environment)) &&
      (await this.available(sql, client, actor.environment)) &&
      ((await globalAdmin(sql, actor.id, actor.environment)) ||
        (await this.role(sql, actor.id, client, actor.environment, 'admin')))
    );
  }
  async team(sql: Sql, client: string, environment: string, id: string) {
    return (
      await sql.query(
        "SELECT * FROM groups WHERE id=$1 AND organisation_id=$2 AND environment=$3 AND active AND kind='team'",
        [id, client, environment],
      )
    ).rows[0];
  }
  async allocated(sql: Sql, actor: AuthUser, member: Membership, primary = false) {
    const coordinator = await this.membership(
      sql,
      actor.id,
      member.organisation_id,
      actor.environment,
    );
    if (!coordinator || coordinator.id === member.id) return false;
    const role = await sql.query(
      `SELECT r.id FROM role_assignments r WHERE r.user_id=$1 AND r.client_membership_id=$2 AND r.organisation_id=$3 AND r.environment=$4 AND r.role='coordinator'
   AND r.starts_at<=now() AND (r.ends_at IS NULL OR r.ends_at>now())
   AND (r.scope_type='client' OR EXISTS(SELECT 1 FROM groups g WHERE g.id=r.group_id AND g.organisation_id=r.organisation_id AND g.environment=r.environment AND g.active AND g.kind='team'))`,
      [actor.id, coordinator.id, member.organisation_id, actor.environment],
    );
    if (!role.rowCount) return false;
    return Boolean(
      (
        await sql.query(
          'SELECT id FROM coordinator_allocations WHERE organisation_id=$1 AND environment=$2 AND member_membership_id=$3 AND coordinator_membership_id=$4 AND ' +
            effective +
            (primary ? " AND kind='primary'" : ''),
          [member.organisation_id, actor.environment, member.id, coordinator.id],
        )
      ).rowCount,
    );
  }
  async viewTraining(
    sql: Sql,
    actor: AuthUser,
    memberId: string,
    recordTeam: string | null,
    recordedAt: Date,
  ) {
    const row = (
      await sql.query<Membership>(
        "SELECT * FROM client_memberships WHERE id=$1 AND environment=$2 AND status='active' AND ended_at IS NULL AND joined_at<=now()",
        [memberId, actor.environment],
      )
    ).rows[0];
    if (
      !row ||
      !(await this.membership(sql, row.user_id, row.organisation_id, actor.environment)) ||
      !(await this.membership(sql, actor.id, row.organisation_id, actor.environment))
    )
      return false;
    if (
      row.user_id === actor.id &&
      (await this.role(sql, actor.id, row.organisation_id, actor.environment, 'member'))
    ) {
      return (
        !recordTeam ||
        Boolean(
          (
            await sql.query(
              "SELECT id FROM groups WHERE id=$1 AND organisation_id=$2 AND environment=$3 AND kind='team'",
              [recordTeam, row.organisation_id, actor.environment],
            )
          ).rowCount,
        )
      );
    }

    // Source Access.enrolments applies this historical restriction to both
    // application records and the approved external feed.
    if (!recordTeam) {
      if (!(await this.allocated(sql, actor, row))) return false;
      return Boolean((await sql.query(
        'SELECT a.id FROM coordinator_allocations a JOIN client_memberships cm ON cm.id=a.coordinator_membership_id AND cm.organisation_id=a.organisation_id AND cm.environment=a.environment WHERE a.organisation_id=$1 AND a.environment=$2 AND a.member_membership_id=$3 AND cm.user_id=$4 AND a.starts_at<=$5 AND a.starts_at<=now() AND (a.ends_at IS NULL OR a.ends_at>now())',
        [row.organisation_id, actor.environment, row.id, actor.id, recordedAt],
      )).rowCount);
    }

    if (!(await this.team(sql, row.organisation_id, actor.environment, recordTeam))) return false;
    const memberHistory = await sql.query(
      'SELECT id FROM client_team_memberships WHERE organisation_id=$1 AND environment=$2 AND client_membership_id=$3 AND group_id=$4 AND starts_at<=$5 AND ' +
        effective,
      [row.organisation_id, actor.environment, row.id, recordTeam, recordedAt],
    );
    if (
      !memberHistory.rowCount ||
      !(await this.role(
        sql,
        actor.id,
        row.organisation_id,
        actor.environment,
        'coordinator',
        recordTeam,
      ))
    )
      return false;
    return Boolean(
      (
        await sql.query(
          "SELECT id FROM role_assignments WHERE user_id=$1 AND organisation_id=$2 AND environment=$3 AND group_id=$4 AND scope_type='team' AND role='coordinator' AND starts_at<=$5 AND " +
            effective,
          [actor.id, row.organisation_id, actor.environment, recordTeam, recordedAt],
        )
      ).rowCount,
    );
  }
  async manageTraining(sql: Sql, actor: AuthUser, memberId: string, team: string | null, at: Date) {
    const member = (
      await sql.query<Membership>(
        'SELECT * FROM client_memberships WHERE id=$1 AND environment=$2',
        [memberId, actor.environment],
      )
    ).rows[0];
    return Boolean(
      member &&
      member.user_id !== actor.id &&
      (await this.viewTraining(sql, actor, memberId, team, at)) &&
      (await this.allocated(sql, actor, member, true)),
    );
  }

  async sensitive(sql: Sql, actor: AuthUser, memberId: string) {
    const row = (
      await sql.query<Membership>(
        'SELECT * FROM client_memberships WHERE id=$1 AND environment=$2',
        [memberId, actor.environment],
      )
    ).rows[0];
    if (
      !row ||
      actor.id === row.user_id ||
      !(await this.membership(sql, row.user_id, row.organisation_id, actor.environment)) ||
      !(await this.allocated(sql, actor, row))
    )
      return false;
    return Boolean(
      (
        await sql.query(
          `SELECT g.id FROM client_sensitive_grants g JOIN coordinator_allocations a ON a.id=g.allocation_id
   JOIN client_memberships cm ON cm.id=a.coordinator_membership_id
   WHERE g.organisation_id=$1 AND g.environment=$2 AND cm.user_id=$3 AND a.member_membership_id=$4
    AND a.organisation_id=g.organisation_id AND a.environment=g.environment
    AND a.starts_at<=now() AND (a.ends_at IS NULL OR a.ends_at>now())
    AND g.starts_at<=now() AND (g.ends_at IS NULL OR g.ends_at>now())`,
          [row.organisation_id, actor.environment, actor.id, memberId],
        )
      ).rowCount,
    );
  }
  async assertActive(sql: Sql, actor: AuthUser) {
    requireCondition(
      await this.active(sql, actor.id, actor.environment),
      403,
      'access_inactive',
      'Your account or synchronized permissions are no longer active.',
    );
  }
}
