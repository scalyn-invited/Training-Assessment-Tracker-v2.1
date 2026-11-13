import { randomUUID } from 'node:crypto';
import type { Sql } from '../../database/src/database.js';
import type { Enrolment } from './enrolments.js';
import { enqueue } from './outbox.js';
export type Notice = {
  id: string;
  organisation_id: string;
  environment: 'test' | 'production';
  enrolment_id: string;
  recipient_id: string;
  kind: string;
  status: string;
  attempts: number;
  dispatch_version: number;
  available_at: Date | null;
  created_at: Date;
  error_code: string | null;
};
export async function dispatchNotice(sql: Sql, notice: Notice) {
  const version = notice.dispatch_version + 1;
  await enqueue(
    sql,
    {
      organisationId: notice.organisation_id,
      environment: notice.environment,
      actorId: notice.recipient_id,
    },
    'learning.notice',
    `notice:${notice.id}:${version}`,
    { noticeId: notice.id },
  );
  await sql.query(
    'UPDATE learning_notifications SET dispatch_version=$1,updated_at=now() WHERE id=$2',
    [version, notice.id],
  );
}
export async function recordNotice(
  sql: Sql,
  e: Enrolment,
  recipient: string | null,
  event: string,
  kind: string,
) {
  if (!recipient) return;
  const notice = (
    await sql.query<Notice>(
      'INSERT INTO learning_notifications(id,organisation_id,environment,enrolment_id,recipient_id,event_key,kind) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(organisation_id,environment,event_key) DO NOTHING RETURNING *',
      [randomUUID(), e.organisation_id, e.environment, e.id, recipient, event, kind],
    )
  ).rows[0];
  if (notice) await dispatchNotice(sql, notice);
}
export async function primaryRecipient(sql: Sql, e: Enrolment) {
  return (
    (
      await sql.query<{ user_id: string }>(
        "SELECT cm.user_id FROM coordinator_allocations a JOIN client_memberships cm ON cm.id=a.coordinator_membership_id WHERE a.member_membership_id=$1 AND a.organisation_id=$2 AND a.environment=$3 AND a.kind='primary' AND a.starts_at<=now() AND (a.ends_at IS NULL OR a.ends_at>now()) AND cm.status='active' AND cm.ended_at IS NULL",
        [e.member_membership_id, e.organisation_id, e.environment],
      )
    ).rows[0]?.user_id ?? null
  );
}
