import type { Sql } from '../../database/src/database.js';
import type { AuthUser } from './auth.js';
import { Enrolments, type Enrolment } from './enrolments.js';
import { dispatchNotice, type Notice } from './notification-records.js';
import { SmtpNoticeMail, mailOutcome, type NoticeMail } from './notification-mail.js';
import type { Job } from './outbox.js';
import { requireCondition } from './errors.js';
type Recipient = AuthUser & { training_email: boolean; is_synthetic: boolean };
export class LearningNotices {
  constructor(
    readonly enrolments: Enrolments,
    readonly mail: NoticeMail = new SmtpNoticeMail(),
    readonly origin = process.env.APP_ORIGIN || 'http://127.0.0.1:3100',
  ) {}
  get db() {
    return this.enrolments.auth.db;
  }
  async state(sql: Sql, n: Notice) {
    const e = (
      await sql.query<Enrolment>(
        'SELECT * FROM enrolments WHERE id=$1 AND organisation_id=$2 AND environment=$3',
        [n.enrolment_id, n.organisation_id, n.environment],
      )
    ).rows[0];
    const user = (
      await sql.query<Recipient>('SELECT * FROM users WHERE id=$1 AND environment=$2', [
        n.recipient_id,
        n.environment,
      ])
    ).rows[0];
    if (!e || !user || !(await this.enrolments.permissions(sql, user, e)).view)
      return { status: 'cancelled', code: 'access_revoked' };
    if (!user.training_email) return { status: 'in_app_only', code: null };
    const member = (
      await sql.query<{ is_synthetic: boolean }>(
        'SELECT is_synthetic FROM users WHERE id=$1 AND environment=$2',
        [e.member_id, e.environment],
      )
    ).rows[0];
    if (e.environment === 'test' || user.is_synthetic || member?.is_synthetic)
      return { status: 'sink_delivered', code: null };
    if (!this.mail.configured()) return { status: 'in_app_only', code: 'smtp_not_configured' };
    let origin: URL;
    try {
      origin = new URL(this.origin);
    } catch {
      return { status: 'in_app_only', code: 'secure_origin_required' };
    }
    if (origin.protocol !== 'https:' || origin.username || origin.password)
      return { status: 'in_app_only', code: 'secure_origin_required' };
    const path = n.kind.startsWith('assessment_') ? '/assessments' : `/enrolments/${e.id}/delivery`;
    return {
      status: 'sending',
      code: null,
      message: { to: user.email, url: new URL(path, origin.origin).href },
    };
  }
  async lock(sql: Sql, job: Job) {
    const n = (
      await sql.query<Notice>(
        'SELECT * FROM learning_notifications WHERE id=$1 AND organisation_id=$2 AND environment=$3 AND recipient_id=$4',
        [job.payload.noticeId, job.organisation_id, job.environment, job.actor_id],
      )
    ).rows[0];
    if (!n) return;
    await sql.query('SELECT id FROM organisations WHERE id=$1 FOR UPDATE', [n.organisation_id]);
    await sql.query(
      'SELECT id FROM users WHERE id IN ($1,(SELECT member_id FROM enrolments WHERE id=$2)) ORDER BY id FOR UPDATE',
      [n.recipient_id, n.enrolment_id],
    );
    const lease = await sql.query(
      "SELECT id FROM outbox_events WHERE id=$1 AND lease_token=$2 AND status='processing' AND lease_until>now()",
      [job.id, job.lease_token],
    );
    requireCondition(lease.rowCount, 409, 'lease_lost', 'The notification job lease expired.');
    return (
      await sql.query<Notice>('SELECT * FROM learning_notifications WHERE id=$1 FOR UPDATE', [n.id])
    ).rows[0];
  }
  async process(job: Job) {
    const claimed = await this.db.transaction(async (sql) => {
      const n = await this.lock(sql, job);
      if (!n || n.status !== 'pending' || (n.available_at && n.available_at.getTime() > Date.now()))
        return false;
      const state = await this.state(sql, n);
      await sql.query(
        "UPDATE learning_notifications SET status=$1,error_code=$2,attempts=attempts+$3,started_at=CASE WHEN $1='sending' THEN now() ELSE started_at END,updated_at=now() WHERE id=$4",
        [
          state.status,
          state.code,
          ['sending', 'sink_delivered'].includes(state.status) ? 1 : 0,
          n.id,
        ],
      );
      return state.status === 'sending';
    });
    if (!claimed) return;
    // The committed sending state survives a crash. Permission changes serialize with this send.
    await this.db.transaction(async (sql) => {
      const n = await this.lock(sql, job);
      if (!n || n.status !== 'sending') return;
      const current = await this.state(sql, n);
      if (current.status !== 'sending' || !current.message) {
        await sql.query(
          'UPDATE learning_notifications SET status=$1,error_code=$2,updated_at=now() WHERE id=$3',
          [current.status, current.code, n.id],
        );
        return;
      }
      try {
        await this.mail.send(current.message);
        await sql.query(
          "UPDATE learning_notifications SET status='relay_accepted',error_code=NULL,updated_at=now() WHERE id=$1",
          [n.id],
        );
      } catch (error) {
        const outcome = mailOutcome(error, n.attempts),
          delay = 10 * n.attempts + Math.floor(Math.random() * 6);
        await sql.query(
          "UPDATE learning_notifications SET status=$1,error_code=$2,available_at=CASE WHEN $1='pending' THEN now()+($3::int*interval '1 second') ELSE NULL END,updated_at=now() WHERE id=$4",
          [outcome.status, outcome.code, delay, n.id],
        );
      }
    });
  }
  async recover() {
    await this.db.transaction(async (sql) => {
      await sql.query(
        "UPDATE learning_notifications SET status='ambiguous',error_code='worker_interrupted',updated_at=now() WHERE status='sending' AND started_at<now()-interval '180 seconds'",
      );
      const pending = (
        await sql.query<Notice>(
          "SELECT * FROM learning_notifications n WHERE n.status='pending' AND (n.available_at IS NULL OR n.available_at<=now()) AND NOT EXISTS(SELECT 1 FROM outbox_events o WHERE o.organisation_id=n.organisation_id AND o.environment=n.environment AND o.kind='learning.notice' AND o.payload->>'noticeId'=n.id::text AND (o.status='pending' OR (o.status='processing' AND o.lease_until>now()))) ORDER BY n.created_at,n.id FOR UPDATE SKIP LOCKED LIMIT 100",
        )
      ).rows;
      for (const notice of pending) await dispatchNotice(sql, notice);
    });
  }
  async read(token: string, client: string, page = 1) {
    requireCondition(
      Number.isInteger(page) && page >= 1 && page <= 100000,
      422,
      'invalid_page',
      'Choose a valid updates page.',
    );
    return this.db.transaction(async (sql) => {
      const actor = await this.enrolments.context(sql, token, client);
      const user = (
        await sql.query<{ training_email: boolean }>(
          'SELECT training_email FROM users WHERE id=$1',
          [actor.id],
        )
      ).rows[0];
      const candidates = (
        await sql.query<Notice>(
          'SELECT * FROM learning_notifications WHERE recipient_id=$1 AND organisation_id=$2 AND environment=$3 ORDER BY created_at DESC,id',
          [actor.id, client, actor.environment],
        )
      ).rows;
      const permitted: Notice[] = [];
      const access = new Map<string, boolean>();
      for (const n of candidates) {
        if (!access.has(n.enrolment_id)) {
          const e = (
            await sql.query<Enrolment>(
              'SELECT * FROM enrolments WHERE id=$1 AND organisation_id=$2 AND environment=$3',
              [n.enrolment_id, client, actor.environment],
            )
          ).rows[0];
          access.set(
            n.enrolment_id,
            !!e && (await this.enrolments.permissions(sql, actor, e)).view,
          );
        }
        if (access.get(n.enrolment_id)) permitted.push(n);
      }
      return {
        trainingEmail: user.training_email,
        page,
        total: permitted.length,
        notices: permitted.slice((page - 1) * 20, page * 20).map((n) => ({
          id: n.id,
          kind: n.kind,
          status: n.status,
          createdAt: n.created_at,
          href: n.kind.startsWith('assessment_')
            ? '/assessments'
            : `/enrolments/${n.enrolment_id}/delivery`,
        })),
      };
    });
  }
  async preference(token: string, csrf: string, trainingEmail: boolean) {
    requireCondition(
      typeof trainingEmail === 'boolean',
      422,
      'preference_required',
      'Choose whether to receive training emails.',
    );
    return this.db.transaction(async (sql) => {
      const { user } = await this.enrolments.auth.verified(sql, token, csrf);
      await sql.query('UPDATE users SET training_email=$1 WHERE id=$2', [trainingEmail, user!.id]);
      return { trainingEmail };
    });
  }
}
