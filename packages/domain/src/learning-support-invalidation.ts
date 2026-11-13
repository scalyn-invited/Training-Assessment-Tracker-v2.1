import type { Sql } from '../../database/src/database.js';
import type { Enrolment } from './enrolments.js';
import type { Delivery } from './delivery.js';
export async function invalidateLearningSupport(
  sql: Sql,
  delivery: Delivery,
  e: Enrolment,
  submission: string,
  approved: string,
) {
  const old = (
    await sql.query<{ id: string }>(
      'SELECT id FROM grade_attempts WHERE submission_attempt_id=$1 AND id<>$2',
      [submission, approved],
    )
  ).rows.map((r) => r.id);
  if (!old.length) return;
  const changed = (
    await sql.query<{ id: string }>(
      "UPDATE adaptation_proposals SET status=CASE WHEN status='approved' THEN 'source_review_required' ELSE 'stale' END,updated_at=now() WHERE enrolment_id=$1 AND status IN ('queued','provisional','approved') AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(source_ids) x(value) WHERE x.value=ANY($2::text[])) RETURNING id",
      [e.id, old],
    )
  ).rows;
  if (!changed.length) return;
  const primary = (
    await sql.query<{ user_id: string }>(
      "SELECT cm.user_id FROM coordinator_allocations a JOIN client_memberships cm ON cm.id=a.coordinator_membership_id WHERE a.member_membership_id=$1 AND a.organisation_id=$2 AND a.environment=$3 AND a.kind='primary' AND a.starts_at<=now() AND (a.ends_at IS NULL OR a.ends_at>now()) AND cm.status='active' AND cm.ended_at IS NULL",
      [e.member_membership_id, e.organisation_id, e.environment],
    )
  ).rows[0];
  for (const p of changed)
    await delivery.notice(
      sql,
      e,
      primary?.user_id ?? null,
      'source-regraded:' + p.id + ':' + approved,
      'source_review_required',
    );
}
