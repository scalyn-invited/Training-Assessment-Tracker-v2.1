import type { Sql } from '../../database/src/database.js';
import type { AuthUser } from './auth.js';
import type { Enrolment } from './enrolments.js';
import { Access } from './access.js';
import { decrypt } from './crypto.js';
export type Appeal = {
  id: string;
  organisation_id: string;
  environment: string;
  assignment_id: string;
  review_id: string;
  reviewer_id: string | null;
  role_assignment_id: string | null;
  status: string;
  reason: string;
  resolution: string | null;
  created_at: Date;
};
export async function openAppeal(sql: Sql, assignment: string) {
  return (
    await sql.query<Appeal>(
      "SELECT * FROM assessment_appeals WHERE assignment_id=$1 AND status='open'",
      [assignment],
    )
  ).rows[0];
}
export async function alternateReviewer(
  sql: Sql,
  actor: AuthUser,
  assignment: string,
  e: Enrolment,
) {
  const appeal = await openAppeal(sql, assignment);
  if (
    !appeal ||
    appeal.reviewer_id !== actor.id ||
    actor.id === e.member_id ||
    !e.group_id ||
    e.environment !== actor.environment ||
    appeal.organisation_id !== e.organisation_id
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
        "SELECT r.id FROM role_assignments r JOIN assessment_reviews d ON d.id=$8 AND d.organisation_id=r.organisation_id AND d.environment=r.environment WHERE r.id=$1 AND r.user_id=$2 AND r.client_membership_id=$3 AND r.organisation_id=$4 AND r.environment=$5 AND r.role='coordinator' AND r.scope_type='team' AND r.group_id=$6 AND r.starts_at<=now() AND (r.ends_at IS NULL OR r.ends_at>now()) AND d.actor_id<>$7",
        [
          appeal.role_assignment_id,
          actor.id,
          member.id,
          e.organisation_id,
          e.environment,
          e.group_id,
          actor.id,
          appeal.review_id,
        ],
      )
    ).rowCount,
  );
}
export async function alternateFile(
  sql: Sql,
  actor: AuthUser,
  e: Enrolment,
  file: string,
  key: Buffer,
) {
  const cases = (
    await sql.query<{ id: string }>(
      "SELECT a.id FROM assessment_assignments a JOIN assessment_appeals p ON p.assignment_id=a.id WHERE a.enrolment_id=$1 AND a.organisation_id=$2 AND a.environment=$3 AND p.status='open' AND p.reviewer_id=$4",
      [e.id, e.organisation_id, e.environment, actor.id],
    )
  ).rows;
  for (const item of cases)
    if (await alternateReviewer(sql, actor, item.id, e)) {
      const attempts = (
        await sql.query<{ snapshot: string }>(
          'SELECT snapshot FROM assessment_attempts WHERE assignment_id=$1 AND organisation_id=$2 AND environment=$3',
          [item.id, e.organisation_id, e.environment],
        )
      ).rows;
      if (
        attempts.some((t) =>
          (JSON.parse(decrypt(t.snapshot, key)).files as string[]).includes(file),
        )
      )
        return true;
    }
  return false;
}
