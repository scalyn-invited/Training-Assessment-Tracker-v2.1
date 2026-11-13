import type { Sql } from '../../database/src/database.js';
import type { AuthUser } from './auth.js';
import type { Enrolment } from './enrolments.js';
import { Access } from './access.js';
import { decrypt } from './crypto.js';
export type LearningAppeal = {
  id: string;
  organisation_id: string;
  environment: string;
  enrolment_id: string;
  submission_attempt_id: string;
  grade_decision_id: string;
  reviewer_id: string | null;
  role_assignment_id: string | null;
  authority_granted_at: Date | null;
  authority_ended_at: Date | null;
  status: string;
  reason: string;
  resolution: string | null;
  created_at: Date;
};
export async function openLearningAppeal(sql: Sql, submission: string) {
  return (
    await sql.query<LearningAppeal>(
      "SELECT * FROM learning_appeals WHERE submission_attempt_id=$1 AND status='open'",
      [submission],
    )
  ).rows[0];
}
export async function learningAlternate(
  sql: Sql,
  actor: AuthUser,
  submission: string,
  e: Enrolment,
) {
  const appeal = await openLearningAppeal(sql, submission);
  if (
    !appeal ||
    appeal.reviewer_id !== actor.id ||
    actor.id === e.member_id ||
    !e.group_id ||
    actor.environment !== e.environment ||
    appeal.organisation_id !== e.organisation_id ||
    appeal.authority_ended_at ||
    !appeal.authority_granted_at ||
    appeal.authority_granted_at > new Date()
  )
    return false;
  const access = new Access(),
    member = await access.membership(sql, actor.id, e.organisation_id, e.environment);
  if (
    !member ||
    !(await access.membership(sql, e.member_id, e.organisation_id, e.environment)) ||
    !(await access.team(sql, e.organisation_id, e.environment, e.group_id))
  )
    return false;
  return Boolean(
    (
      await sql.query(
        "SELECT r.id FROM role_assignments r JOIN grade_decisions d ON d.id=$7 AND d.organisation_id=r.organisation_id AND d.environment=r.environment WHERE r.id=$1 AND r.user_id=$2 AND r.client_membership_id=$3 AND r.organisation_id=$4 AND r.environment=$5 AND r.role='coordinator' AND r.scope_type='team' AND r.group_id=$6 AND r.starts_at<=now() AND (r.ends_at IS NULL OR r.ends_at>now()) AND d.actor_id<>$2",
        [
          appeal.role_assignment_id,
          actor.id,
          member.id,
          e.organisation_id,
          e.environment,
          e.group_id,
          appeal.grade_decision_id,
        ],
      )
    ).rowCount,
  );
}
export async function learningAlternateFile(
  sql: Sql,
  actor: AuthUser,
  e: Enrolment,
  file: string,
  key: Buffer,
) {
  const cases = (
    await sql.query<{ id: string; payload: string }>(
      "SELECT s.id,s.payload FROM submission_attempts s JOIN learning_appeals a ON a.submission_attempt_id=s.id WHERE s.enrolment_id=$1 AND s.organisation_id=$2 AND s.environment=$3 AND a.status='open' AND a.reviewer_id=$4",
      [e.id, e.organisation_id, e.environment, actor.id],
    )
  ).rows;
  for (const item of cases)
    if (await learningAlternate(sql, actor, item.id, e)) {
      if ((JSON.parse(decrypt(item.payload, key)).files as string[]).includes(file)) return true;
    }
  return false;
}
