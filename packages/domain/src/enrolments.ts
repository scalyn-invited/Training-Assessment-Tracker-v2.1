import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Auth, type AuthUser } from './auth.js';
import { Access } from './access.js';
import { Tenancy, invalidate } from './tenancy.js';
import { requireCondition } from './errors.js';
import type { Sql } from '../../database/src/database.js';
export type Enrolment = {
  id: string;
  organisation_id: string;
  environment: 'test' | 'production';
  member_id: string;
  member_membership_id: string;
  coordinator_id: string;
  group_id: string | null;
  title: string;
  status: string;
  version: number;
  created_at: Date;
  timezone: string;
  duration_weeks: number;
  daily_minutes: number;
};
const createInput = z.object({
  memberId: z.uuid(),
  coordinatorId: z.uuid(),
  groupId: z.uuid().nullable(),
  title: z.string().trim().min(1).max(160),
  reason: z.string().trim().min(8).max(2000),
});
export class Enrolments {
  readonly access = new Access();
  readonly tenancy: Tenancy;
  constructor(readonly auth: Auth) {
    this.tenancy = new Tenancy(auth);
  }
  async context(sql: Sql, token: string, client: string, csrf?: string) {
    const { user, session } = await this.auth.verified(sql, token, csrf);
    requireCondition(
      session.organisation_id === client &&
        (await this.access.available(sql, client, user!.environment)),
      403,
      'client_required',
      'Select this available client first.',
    );
    return user!;
  }
  async permissions(sql: Sql, actor: AuthUser, row: Enrolment) {
    const view = await this.access.viewTraining(
      sql,
      actor,
      row.member_membership_id,
      row.group_id,
      row.created_at,
    );
    const details = Boolean(
      view &&
      (actor.id === row.member_id ||
        (await this.access.sensitive(sql, actor, row.member_membership_id))),
    );
    const manage = Boolean(
      details &&
      (await this.access.manageTraining(
        sql,
        actor,
        row.member_membership_id,
        row.group_id,
        row.created_at,
      )),
    );
    return { view, details, manage };
  }
  async record(
    sql: Sql,
    actor: AuthUser,
    client: string,
    id: string,
    level: 'view' | 'details' | 'manage' = 'view',
  ) {
    const row = (
      await sql.query<Enrolment>(
        'SELECT * FROM enrolments WHERE id=$1 AND organisation_id=$2 AND environment=$3',
        [id, client, actor.environment],
      )
    ).rows[0];
    requireCondition(
      row && (await this.permissions(sql, actor, row))[level],
      404,
      'enrolment_unavailable',
      'This member record is unavailable.',
    );
    return row;
  }
  async create(token: string, csrf: string, client: string, input: unknown) {
    const data = createInput.parse(input);
    return this.tenancy.mutate(token, csrf, client, data.reason, async (sql, actor) => {
      await this.context(sql, token, client, csrf);
      const member = await this.tenancy.member(sql, client, actor.environment, data.memberId);
      const reviewer = await this.tenancy.member(
        sql,
        client,
        actor.environment,
        data.coordinatorId,
      );
      await sql.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [member.user_id]);
      requireCondition(
        member.user_id !== reviewer.user_id &&
          (await this.access.role(sql, member.user_id, client, actor.environment, 'member')),
        422,
        'invalid_member',
        'Choose a member and a different coordinator.',
      );
      const roles = await sql.query(
        "SELECT id FROM role_assignments r WHERE client_membership_id=$1 AND organisation_id=$2 AND environment=$3 AND role='coordinator' AND starts_at<=now() AND (ends_at IS NULL OR ends_at>now()) AND (scope_type='client' OR EXISTS(SELECT 1 FROM groups g WHERE g.id=r.group_id AND g.organisation_id=r.organisation_id AND g.environment=r.environment AND g.kind='team' AND g.active))",
        [reviewer.id, client, actor.environment],
      );
      requireCondition(roles.rowCount, 422, 'invalid_coordinator', 'Choose a current coordinator.');
      if (data.groupId) {
        requireCondition(
          (await this.access.team(sql, client, actor.environment, data.groupId)) &&
            (await this.access.role(
              sql,
              reviewer.user_id,
              client,
              actor.environment,
              'coordinator',
              data.groupId,
            )),
          422,
          'invalid_team',
          'Choose a team this coordinator currently manages.',
        );
        requireCondition(
          (
            await sql.query(
              'SELECT id FROM client_team_memberships WHERE client_membership_id=$1 AND organisation_id=$2 AND environment=$3 AND group_id=$4 AND starts_at<=now() AND ends_at IS NULL',
              [member.id, client, actor.environment, data.groupId],
            )
          ).rowCount,
          422,
          'invalid_team_member',
          'The member must currently belong to this team.',
        );
      }
      const primary = (
        await sql.query(
          "SELECT coordinator_membership_id FROM coordinator_allocations WHERE member_membership_id=$1 AND organisation_id=$2 AND environment=$3 AND kind='primary' AND ends_at IS NULL",
          [member.id, client, actor.environment],
        )
      ).rows[0];
      if (primary)
        requireCondition(
          primary.coordinator_membership_id === reviewer.id,
          409,
          'primary_conflict',
          'Explicitly replace the primary allocation first.',
        );
      else {
        requireCondition(
          !(
            await sql.query(
              'SELECT id FROM coordinator_allocations WHERE member_membership_id=$1 AND coordinator_membership_id=$2 AND ends_at IS NULL',
              [member.id, reviewer.id],
            )
          ).rowCount,
          409,
          'allocation_conflict',
          'End the existing backup allocation before assigning this coordinator as primary.',
        );
        const allocation = randomUUID();
        await sql.query(
          "INSERT INTO coordinator_allocations(id,organisation_id,environment,member_membership_id,coordinator_membership_id,kind,assigned_by,reason) VALUES($1,$2,$3,$4,$5,'primary',$6,$7)",
          [allocation, client, actor.environment, member.id, reviewer.id, actor.id, data.reason],
        );
        await this.tenancy.audit(
          sql,
          actor,
          client,
          'coordinator.allocated',
          allocation,
          data.reason,
        );
        await invalidate(sql, [member.user_id, reviewer.user_id]);
      }
      const id = randomUUID();
      await sql.query(
        'INSERT INTO enrolments(id,organisation_id,environment,member_id,member_membership_id,coordinator_id,group_id,title) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          id,
          client,
          actor.environment,
          member.user_id,
          member.id,
          reviewer.user_id,
          data.groupId,
          data.title,
        ],
      );
      await this.tenancy.audit(sql, actor, client, 'enrolment.created', id, data.reason);
      return { id, version: 1, status: 'onboarding' };
    });
  }
  async list(token: string, client: string, search = '', page = 1, overview = false) {
    requireCondition(
      search.length <= 120 && Number.isInteger(page) && page > 0 && page <= 100000,
      422,
      'invalid_filter',
      'Enter a valid search or page.',
    );
    return this.auth.db.transaction(async (sql) => {
      const actor = await this.context(sql, token, client);
      const candidates = (
        await sql.query<Enrolment & { member_name: string; group_name: string | null }>(
          "SELECT e.*,u.name member_name,g.name group_name FROM enrolments e JOIN users u ON u.id=e.member_id AND u.environment=e.environment LEFT JOIN groups g ON g.id=e.group_id AND g.organisation_id=e.organisation_id AND g.environment=e.environment WHERE e.organisation_id=$1 AND e.environment=$2 AND (e.title ILIKE '%'||$3||'%' OR u.name ILIKE '%'||$3||'%') ORDER BY " +
            (overview ? 'e.title,e.id' : 'e.created_at DESC,e.id'),
          [client, actor.environment, search],
        )
      ).rows;
      const visible = [];
      for (const row of candidates) {
        const permission = await this.permissions(sql, actor, row);
        if (permission.view)
          visible.push({
            id: row.id,
            title: row.title,
            status: row.status,
            version: row.version,
            memberName: row.member_name,
            groupId: row.group_id,
            groupName: row.group_name,
            durationWeeks: row.duration_weeks,
            dailyMinutes: row.daily_minutes,
            createdAt: row.created_at,
            canDetails: permission.details,
            canManage: permission.manage,
          });
      }
      const pageSize = overview ? 12 : 20;
      return {
        records: visible.slice((page - 1) * pageSize, page * pageSize),
        total: visible.length,
        page,
      };
    });
  }
  async detail(token: string, client: string, id: string) {
    return this.auth.db.transaction(async (sql) => {
      const actor = await this.context(sql, token, client);
      const row = await this.record(sql, actor, client, id);
      const permissions = await this.permissions(sql, actor, row);
      const summary = {
        id: row.id,
        title: row.title,
        status: row.status,
        canDetails: permissions.details,
      };
      if (!permissions.details) return summary;
      const member = (
        await sql.query('SELECT name,sync_policy FROM users WHERE id=$1 AND environment=$2', [
          row.member_id,
          actor.environment,
        ])
      ).rows[0];
      const group = row.group_id
        ? (
            await sql.query(
              'SELECT name FROM groups WHERE id=$1 AND organisation_id=$2 AND environment=$3',
              [row.group_id, client, actor.environment],
            )
          ).rows[0]
        : null;
      const primary = (
        await sql.query<AuthUser>(
          "SELECT u.* FROM coordinator_allocations a JOIN client_memberships cm ON cm.id=a.coordinator_membership_id AND cm.organisation_id=a.organisation_id AND cm.environment=a.environment JOIN users u ON u.id=cm.user_id AND u.environment=cm.environment WHERE a.member_membership_id=$1 AND a.organisation_id=$2 AND a.environment=$3 AND a.kind='primary' AND a.starts_at<=now() AND (a.ends_at IS NULL OR a.ends_at>now()) AND cm.status='active' AND cm.ended_at IS NULL",
          [row.member_membership_id, client, actor.environment],
        )
      ).rows[0];
      const membership = await this.access.membership(
        sql,
        row.member_id,
        client,
        actor.environment,
      );
      const coordinator =
        primary &&
        membership &&
        (await this.access.active(sql, primary.id, actor.environment)) &&
        (await this.access.allocated(sql, primary, membership, true))
          ? primary.name
          : null;
      return {
        ...summary,
        version: row.version,
        memberName: member.name,
        coordinatorName: coordinator,
        groupName: group?.name ?? null,
        durationWeeks: row.duration_weeks,
        dailyMinutes: row.daily_minutes,
        timezone: row.timezone,
        syncPolicy: member.sync_policy,
        canManage: permissions.manage,
        canUpload: actor.id === row.member_id || permissions.manage,
        hasCurriculum: Boolean(
          (
            await sql.query(
              'SELECT id FROM programme_versions WHERE enrolment_id=$1 AND organisation_id=$2 AND environment=$3 LIMIT 1',
              [id, client, actor.environment],
            )
          ).rowCount,
        ),
      };
    });
  }
  async choices(token: string, client: string) {
    return this.auth.db.transaction(async (sql) => {
      const actor = await this.context(sql, token, client);
      requireCondition(
        await this.access.administer(sql, actor, client),
        403,
        'admin_required',
        'Client administration permission is required.',
      );
      const rows = (
        await sql.query<{ id: string; user_id: string; name: string }>(
          "SELECT cm.id,cm.user_id,u.name FROM client_memberships cm JOIN users u ON u.id=cm.user_id AND u.environment=cm.environment WHERE cm.organisation_id=$1 AND cm.environment=$2 AND cm.status='active' AND cm.ended_at IS NULL ORDER BY u.name,cm.id",
          [client, actor.environment],
        )
      ).rows;
      const members = [],
        coordinators = [];
      for (const row of rows) {
        if (!(await this.access.membership(sql, row.user_id, client, actor.environment))) continue;
        if (await this.access.role(sql, row.user_id, client, actor.environment, 'member'))
          members.push(row);
        if (
          (
            await sql.query(
              "SELECT id FROM role_assignments r WHERE client_membership_id=$1 AND role='coordinator' AND starts_at<=now() AND (ends_at IS NULL OR ends_at>now()) AND (scope_type='client' OR EXISTS(SELECT 1 FROM groups g WHERE g.id=r.group_id AND g.active AND g.kind='team'))",
              [row.id],
            )
          ).rowCount
        )
          coordinators.push(row);
      }
      const teams = (
        await sql.query(
          "SELECT id,name FROM groups WHERE organisation_id=$1 AND environment=$2 AND active AND kind='team' ORDER BY name,id",
          [client, actor.environment],
        )
      ).rows;
      return { members, coordinators, teams };
    });
  }
}
