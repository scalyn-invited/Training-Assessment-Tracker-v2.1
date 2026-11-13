import { recordNotice } from './notification-records.js';
import { randomUUID } from 'node:crypto';
import { alternateReviewer } from './assessment-access.js';
import { AssessmentDefinitions } from './assessment-definitions.js';
import { Enrolments, type Enrolment } from './enrolments.js';
import type { AuthUser } from './auth.js';
import type { Sql } from '../../database/src/database.js';
import { requireCondition } from './errors.js';
import { mediaIds, type AssessmentDraft } from './assessment-content.js';
type Rule = {
  id: string;
  organisation_id: string;
  environment: 'test' | 'production';
  definition_id: string;
  group_id: string;
  actor_id: string;
  active: boolean;
  version: number;
  result: string | null;
  checked_at: Date | null;
};
export class AssessmentAssignments {
  readonly enrolments: Enrolments;
  constructor(readonly definitions: AssessmentDefinitions) {
    this.enrolments = new Enrolments(definitions.auth);
  }
  async isAuthor(sql: Sql, actor: AuthUser, client: string) {
    const member = await this.definitions.access.membership(
      sql,
      actor.id,
      client,
      actor.environment,
    );
    return Boolean(
      member &&
      (
        await sql.query(
          "SELECT id FROM role_assignments r WHERE client_membership_id=$1 AND organisation_id=$2 AND environment=$3 AND role='coordinator' AND starts_at<=now() AND (ends_at IS NULL OR ends_at>now()) AND (scope_type='client' OR EXISTS(SELECT 1 FROM groups g WHERE g.id=r.group_id AND g.organisation_id=r.organisation_id AND g.environment=r.environment AND g.active AND g.kind='team'))",
          [member.id, client, actor.environment],
        )
      ).rowCount,
    );
  }
  async eligible(sql: Sql, actor: AuthUser, client: string, team?: string) {
    const rows = (
      await sql.query<Enrolment & { member_name: string }>(
        "SELECT e.*,u.name member_name FROM enrolments e JOIN users u ON u.id=e.member_id AND u.environment=e.environment WHERE e.organisation_id=$1 AND e.environment=$2 AND e.status IN ('onboarding','ready','active','paused') AND ($3::uuid IS NULL OR e.group_id=$3) ORDER BY u.name,e.id",
        [client, actor.environment, team ?? null],
      )
    ).rows;
    const result = [];
    for (const row of rows)
      if ((await this.enrolments.permissions(sql, actor, row)).manage) result.push(row);
    return result;
  }
  private async published(sql: Sql, actor: AuthUser, client: string, id: string) {
    const row = (
      await sql.query<{ id: string; title: string; revision: number; status: string }>(
        'SELECT id,title,revision,status FROM assessment_definitions WHERE id=$1 AND organisation_id=$2 AND environment=$3',
        [id, client, actor.environment],
      )
    ).rows[0];
    requireCondition(
      row?.status === 'published',
      422,
      'published_required',
      'Choose a published assessment revision.',
    );
    return row;
  }
  async list(token: string, client: string, page = 1) {
    requireCondition(
      Number.isInteger(page) && page >= 1 && page <= 100000,
      422,
      'invalid_page',
      'Choose a valid page.',
    );
    return this.definitions.auth.db.transaction(async (sql) => {
      const actor = await this.enrolments.context(sql, token, client);
      const rows = (
        await sql.query<
          Enrolment & {
            assignment_id: string;
            assignment_status: string;
            definition_title: string;
            revision: number;
            member_name: string;
          }
        >(
          'SELECT e.*,a.id assignment_id,a.status assignment_status,d.title definition_title,d.revision,u.name member_name FROM assessment_assignments a JOIN enrolments e ON e.id=a.enrolment_id AND e.organisation_id=a.organisation_id AND e.environment=a.environment JOIN assessment_definitions d ON d.id=a.definition_id JOIN users u ON u.id=e.member_id WHERE a.organisation_id=$1 AND a.environment=$2 ORDER BY a.created_at DESC,a.id',
          [client, actor.environment],
        )
      ).rows;
      const visible = [];
      for (const row of rows)
        if (
          (await this.enrolments.permissions(sql, actor, row)).details ||
          (await alternateReviewer(sql, actor, row.assignment_id, row))
        )
          visible.push({
            id: row.assignment_id,
            title: row.definition_title,
            memberName: row.member_name,
            status: row.assignment_status,
            revision: row.revision,
          });
      return {
        author: await this.isAuthor(sql, actor, client),
        assignments: visible.slice((page - 1) * 20, page * 20),
        total: visible.length,
        page,
      };
    });
  }
  async choices(token: string, client: string, definition: string) {
    return this.definitions.auth.db.transaction(async (sql) => {
      const actor = await this.definitions.author(sql, token, client);
      const published = await this.published(sql, actor, client, definition);
      const candidates = (
        await sql.query<{ id: string; name: string }>(
          "SELECT id,name FROM groups WHERE organisation_id=$1 AND environment=$2 AND active AND kind='team' ORDER BY name,id",
          [client, actor.environment],
        )
      ).rows;
      const teams = [];
      for (const team of candidates)
        if (
          await this.definitions.access.role(
            sql,
            actor.id,
            client,
            actor.environment,
            'coordinator',
            team.id,
          )
        )
          teams.push({
            ...team,
            eligibleCount: (await this.eligible(sql, actor, client, team.id)).length,
          });
      const members = (await this.eligible(sql, actor, client)).map((row) => ({
        id: row.id,
        name: row.member_name,
        title: row.title,
      }));
      const rules = (
        await sql.query(
          'SELECT id,group_id,active,version,result,checked_at FROM assessment_team_rules WHERE organisation_id=$1 AND environment=$2 AND definition_id=$3 AND actor_id=$4 ORDER BY created_at,id',
          [client, actor.environment, definition, actor.id],
        )
      ).rows;
      return { definition: published, members, teams, rules };
    });
  }
  async assignIn(
    sql: Sql,
    actor: AuthUser,
    client: string,
    definition: string,
    enrolment: Enrolment,
    rule: string | null = null,
  ) {
    requireCondition(
      ['onboarding', 'ready', 'active', 'paused'].includes(enrolment.status) &&
        enrolment.organisation_id === client &&
        (await this.enrolments.permissions(sql, actor, enrolment)).manage,
      403,
      'assignment_forbidden',
      'Current primary coordinator and sensitive-assessment authority are required.',
    );
    const id = randomUUID();
    const inserted = (
      await sql.query(
        'INSERT INTO assessment_assignments(id,organisation_id,environment,definition_id,enrolment_id,actor_id,team_rule_id) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(definition_id,enrolment_id) DO NOTHING RETURNING id',
        [id, client, actor.environment, definition, enrolment.id, actor.id, rule],
      )
    ).rows[0];
    if (inserted) {
      await this.definitions.audit(sql, actor, client, 'assessment.assigned', id);
      await recordNotice(
        sql,
        enrolment,
        enrolment.member_id,
        'assessment:' + id,
        'assessment_assigned',
      );
    }
    return (
      inserted?.id ??
      ((
        await sql.query(
          'SELECT id FROM assessment_assignments WHERE definition_id=$1 AND enrolment_id=$2 AND organisation_id=$3 AND environment=$4',
          [definition, enrolment.id, client, actor.environment],
        )
      ).rows[0].id as string)
    );
  }
  async create(
    token: string,
    csrf: string,
    client: string,
    definition: string,
    mode: 'member' | 'team',
    target: string,
  ) {
    return this.definitions.auth.db.transaction(async (sql) => {
      await sql.query('SELECT id FROM organisations WHERE id=$1 FOR UPDATE', [client]);
      const actor = await this.definitions.author(sql, token, client, csrf);
      await this.published(sql, actor, client, definition);
      if (mode === 'member') {
        const row = await this.enrolments.record(sql, actor, client, target, 'manage');
        await sql.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [row.member_id]);
        return { id: await this.assignIn(sql, actor, client, definition, row), mode };
      }
      requireCondition(
        mode === 'team' &&
          (await this.definitions.access.role(
            sql,
            actor.id,
            client,
            actor.environment,
            'coordinator',
            target,
          )),
        422,
        'team_required',
        'Choose an authorised team.',
      );
      const id = randomUUID();
      await sql.query(
        'INSERT INTO assessment_team_rules(id,organisation_id,environment,definition_id,group_id,actor_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(definition_id,group_id,actor_id) DO NOTHING',
        [id, client, actor.environment, definition, target, actor.id],
      );
      const rule = (
        await sql.query<Rule>(
          'SELECT * FROM assessment_team_rules WHERE definition_id=$1 AND group_id=$2 AND actor_id=$3',
          [definition, target, actor.id],
        )
      ).rows[0];
      requireCondition(
        rule.active,
        409,
        'rule_stopped',
        'This rule was stopped. Use Resume to restart it.',
      );
      if (rule.id === id)
        await this.definitions.audit(sql, actor, client, 'assessment.team_rule_created', id);
      await this.processIn(sql, rule);
      return { id: rule.id, mode };
    });
  }
  private async processIn(sql: Sql, rule: Rule) {
    if (!rule.active) return;
    const actor = (
      await sql.query<AuthUser>(
        'SELECT id,name,email,environment,permission_version,false global_admin FROM users WHERE id=$1 AND environment=$2',
        [rule.actor_id, rule.environment],
      )
    ).rows[0];
    if (
      !actor ||
      !(await this.isAuthor(sql, actor, rule.organisation_id)) ||
      !(await this.definitions.access.role(
        sql,
        actor.id,
        rule.organisation_id,
        actor.environment,
        'coordinator',
        rule.group_id,
      ))
    ) {
      await sql.query(
        "UPDATE assessment_team_rules SET result='Blocked: the rule creator no longer has current team permissions. Restore permissions and retry, or stop this rule.',checked_at=now() WHERE id=$1",
        [rule.id],
      );
      return;
    }
    await this.published(sql, actor, rule.organisation_id, rule.definition_id);
    const records = await this.eligible(sql, actor, rule.organisation_id, rule.group_id);
    for (const record of records)
      await this.assignIn(sql, actor, rule.organisation_id, rule.definition_id, record, rule.id);
    await sql.query('UPDATE assessment_team_rules SET result=$1,checked_at=now() WHERE id=$2', [
      records.length +
        ' eligible member records assigned or already assigned. Members without an eligible enrolment, primary allocation or sensitive-assessment grant will be retried when eligible.',
      rule.id,
    ]);
  }
  async change(
    token: string,
    csrf: string,
    client: string,
    id: string,
    version: number,
    action: 'stop' | 'resume' | 'retry',
  ) {
    return this.definitions.auth.db.transaction(async (sql) => {
      await sql.query('SELECT id FROM organisations WHERE id=$1 FOR UPDATE', [client]);
      const actor = await this.definitions.author(sql, token, client, csrf);
      const rule = (
        await sql.query<Rule>(
          'SELECT * FROM assessment_team_rules WHERE id=$1 AND organisation_id=$2 AND environment=$3 AND actor_id=$4 FOR UPDATE',
          [id, client, actor.environment, actor.id],
        )
      ).rows[0];
      requireCondition(rule, 404, 'rule_unavailable', 'This assignment rule is unavailable.');
      requireCondition(
        rule.version === version,
        409,
        'stale_rule',
        'This rule changed. Reload before updating it.',
      );
      if (action !== 'stop')
        requireCondition(
          await this.definitions.access.role(
            sql,
            actor.id,
            client,
            actor.environment,
            'coordinator',
            rule.group_id,
          ),
          403,
          'team_required',
          'Current team coordinator authority is required.',
        );
      requireCondition(
        action !== 'retry' || rule.active,
        409,
        'rule_stopped',
        'Resume the rule before retrying.',
      );
      const active = action === 'stop' ? false : action === 'resume' ? true : rule.active;
      await sql.query('UPDATE assessment_team_rules SET active=$1,version=version+1 WHERE id=$2', [
        active,
        id,
      ]);
      if (action !== 'retry')
        await this.definitions.audit(
          sql,
          actor,
          client,
          active ? 'assessment.team_rule_resumed' : 'assessment.team_rule_stopped',
          id,
        );
      if (active) await this.processIn(sql, { ...rule, active });
      return { id, active, version: version + 1 };
    });
  }
  async recover() {
    const db = this.definitions.auth.db,
      environment = process.env.NODE_ENV === 'production' ? 'production' : 'test';
    const rules = (
      await db.pool.query<{ id: string; organisation_id: string }>(
        'SELECT id,organisation_id FROM assessment_team_rules WHERE active AND environment=$1 ORDER BY id',
        [environment],
      )
    ).rows;
    for (const reference of rules) {
      try {
        await db.transaction(async (sql) => {
          await sql.query('SELECT id FROM organisations WHERE id=$1 FOR UPDATE', [
            reference.organisation_id,
          ]);
          const rule = (
            await sql.query<Rule>(
              'SELECT * FROM assessment_team_rules WHERE id=$1 AND environment=$2 FOR UPDATE',
              [reference.id, environment],
            )
          ).rows[0];
          if (rule) await this.processIn(sql, rule);
        });
      } catch {
        await db.pool.query(
          "UPDATE assessment_team_rules SET result='Assignment processing failed. Existing assignments are preserved. Retry processing.',checked_at=now() WHERE id=$1 AND environment=$2",
          [reference.id, environment],
        );
      }
    }
  }
  async canReadMedia(sql: Sql, actor: AuthUser, client: string, media: string) {
    const rows = (
      await sql.query<
        Enrolment & { assignment_id: string; questions: AssessmentDraft['questions'] }
      >(
        'SELECT e.*,a.id assignment_id,d.questions FROM assessment_assignments a JOIN enrolments e ON e.id=a.enrolment_id JOIN assessment_definitions d ON d.id=a.definition_id WHERE a.organisation_id=$1 AND a.environment=$2',
        [client, actor.environment],
      )
    ).rows;
    for (const row of rows)
      if (
        mediaIds(row.questions).includes(media) &&
        ((await this.enrolments.permissions(sql, actor, row)).details ||
          (await alternateReviewer(sql, actor, row.assignment_id, row)))
      )
        return true;
    return false;
  }
}
