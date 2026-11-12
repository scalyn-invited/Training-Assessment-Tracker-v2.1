import { randomUUID } from 'node:crypto';
import type { Sql } from '../../database/src/database.js';
export async function seedTenancy(sql: Sql, adminId: string) {
  await sql.query(
    "INSERT INTO role_assignments(id,user_id,role,environment,scope_type,scope_key,granted_by,reason) VALUES($1,$2,'admin','test','platform','platform',$2,'First administrator setup')",
    [randomUUID(), adminId],
  );
  const members = await sql.query<{
    id: string;
    user_id: string;
    organisation_id: string;
    email: string;
  }>(
    'SELECT cm.id,cm.user_id,cm.organisation_id,u.email FROM client_memberships cm JOIN users u ON u.id=cm.user_id WHERE cm.environment=$1 ORDER BY u.email',
    ['test'],
  );
  const teams = new Map<string, string>(),
    coordinators = new Map<string, string>();
  for (const member of members.rows) {
    const person = Number(member.email.split('.')[2]?.split('@')[0]),
      role = person === 0 ? 'admin' : person <= 2 ? 'coordinator' : 'member';
    await sql.query(
      "INSERT INTO platform_client_states(organisation_id,environment) VALUES($1,'test') ON CONFLICT DO NOTHING",
      [member.organisation_id],
    );
    await sql.query(
      "INSERT INTO role_assignments(id,user_id,role,organisation_id,environment,client_membership_id,scope_type,scope_key,granted_by,reason) VALUES($1,$2,$3,$4,'test',$5,'client',$6,$7,'Synthetic demo setup')",
      [
        randomUUID(),
        member.user_id,
        role,
        member.organisation_id,
        member.id,
        'client:' + member.organisation_id,
        adminId,
      ],
    );
    if (!teams.has(member.organisation_id)) {
      const id = randomUUID();
      teams.set(member.organisation_id, id);
      await sql.query(
        "INSERT INTO groups(id,organisation_id,environment,name,kind) VALUES($1,$2,'test','Demo team','team')",
        [id, member.organisation_id],
      );
    }
    const team = teams.get(member.organisation_id)!;
    if (role === 'coordinator') {
      coordinators.set(member.organisation_id, member.id);
      await sql.query(
        "INSERT INTO role_assignments(id,user_id,role,organisation_id,environment,client_membership_id,group_id,scope_type,scope_key,granted_by,reason) VALUES($1,$2,'coordinator',$3,'test',$4,$5,'team',$6,$7,'Synthetic demo setup')",
        [
          randomUUID(),
          member.user_id,
          member.organisation_id,
          member.id,
          team,
          'team:' + team,
          adminId,
        ],
      );
    }
    if (role === 'member')
      await sql.query(
        "INSERT INTO client_team_memberships(id,organisation_id,environment,client_membership_id,group_id) VALUES($1,$2,'test',$3,$4)",
        [randomUUID(), member.organisation_id, member.id, team],
      );
  }
  for (const member of members.rows) {
    if (Number(member.email.split('.')[2]?.split('@')[0]) < 3) continue;
    await sql.query(
      "INSERT INTO coordinator_allocations(id,organisation_id,environment,member_membership_id,coordinator_membership_id,kind,assigned_by,reason) VALUES($1,$2,'test',$3,$4,'primary',$5,'Synthetic demo setup')",
      [
        randomUUID(),
        member.organisation_id,
        member.id,
        coordinators.get(member.organisation_id),
        adminId,
      ],
    );
  }
}
