import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import type { Sql } from '../../database/src/database.js';
import type { Enrolment } from './enrolments.js';
import { Delivery, type DeliveryBlock } from './delivery.js';
import { LearningKpiRecords, type KpiVersion } from './learning-kpi-records.js';
import { addDays } from './learning-calendar.js';
import { encrypt, decrypt } from './crypto.js';
import { requireCondition } from './errors.js';
type Preview = {
  weeks: number;
  calendar_id: string;
  days: Record<string, number>;
  replacements: Record<string, ReturnType<Delivery['content']>>;
};
type CalendarChange = {
  id: string;
  enrolment_version: number;
  preview: string;
  status: string;
  reason: string;
  created_at: Date;
};
export class LearningLifecycle {
  readonly kpis: LearningKpiRecords;
  constructor(readonly delivery: Delivery) {
    this.kpis = new LearningKpiRecords(delivery);
  }
  get onboarding() {
    return this.delivery.plans.onboarding;
  }
  current(e: Enrolment, expected: number, status: string) {
    z.number().int().positive().parse(expected);
    requireCondition(
      e.version === expected && e.status === status,
      409,
      'lifecycle_conflict',
      'The training record changed. Reload before continuing.',
    );
  }
  async blocks(sql: Sql, e: Enrolment) {
    return (
      await sql.query<DeliveryBlock>(
        "SELECT * FROM learning_blocks WHERE enrolment_id=$1 AND organisation_id=$2 AND environment=$3 AND state='current' ORDER BY number",
        [e.id, e.organisation_id, e.environment],
      )
    ).rows;
  }
  async pause(
    token: string,
    csrf: string,
    client: string,
    id: string,
    expected: number,
    reason: string,
  ) {
    return this.delivery.locked(token, csrf, client, id, async (sql, actor, e) => {
      await this.onboarding.authorise(sql, actor, e, true);
      this.delivery.reason(reason);
      this.current(e, expected, 'active');
      await sql.query(
        "UPDATE enrolments SET status='paused',version=version+1,updated_at=now() WHERE id=$1",
        [e.id],
      );
      await this.delivery.enrolments.tenancy.audit(
        sql,
        actor,
        client,
        'enrolment.paused',
        id,
        reason,
      );
      await this.delivery.notice(
        sql,
        e,
        e.member_id,
        'paused:' + id + ':' + (e.version + 1),
        'programme_paused',
      );
      return { version: e.version + 1, status: 'paused' };
    });
  }
  async previewData(sql: Sql, e: Enrolment, weeks: number): Promise<Preview> {
    z.number().int().min(0).max(52).parse(weeks);
    requireCondition(
      e.status === 'paused',
      409,
      'not_paused',
      'Pause the training record before previewing resumption.',
    );
    const calendar = await this.onboarding.calendar(sql, e);
    requireCondition(
      calendar,
      409,
      'calendar_required',
      'Confirm the shared member calendar first.',
    );
    const days: Record<string, number> = {},
      replacements: Preview['replacements'] = {},
      today = this.delivery.today(e.timezone);
    for (const block of await this.blocks(sql, e)) {
      const content = this.delivery.content(block);
      const used = (
        await sql.query(
          'SELECT id FROM work_drafts WHERE learning_block_id=$1 UNION ALL SELECT id FROM submission_attempts WHERE learning_block_id=$1 LIMIT 1',
          [block.id],
        )
      ).rowCount;
      if (!block.started_at && !used) {
        content.start = addDays(content.start, weeks * 7);
        content.freeze_at = this.onboarding.calendarRules.freeze(calendar, content.start);
        for (const lesson of content.lessons) lesson.date = addDays(lesson.date, weeks * 7);
        requireCondition(
          weeks === 0 || content.start >= today,
          422,
          'past_reschedule',
          'Move upcoming blocks to today or later.',
        );
        replacements[block.id] = content;
      }
      for (const lesson of content.lessons)
        if (lesson.date >= today)
          days[lesson.date] =
            (days[lesson.date] ?? 0) +
            lesson.reading! +
            lesson.practice! +
            lesson.assessment! +
            lesson.revision!;
    }
    await this.onboarding.calendarRules.assertCapacity(sql, calendar, days, e.id);
    return { weeks, calendar_id: calendar.id, days, replacements };
  }
  async preview(
    token: string,
    csrf: string,
    client: string,
    id: string,
    expected: number,
    weeks: number,
    reason: string,
  ) {
    return this.delivery.locked(token, csrf, client, id, async (sql, actor, e) => {
      await this.onboarding.authorise(sql, actor, e, true);
      this.delivery.reason(reason);
      this.current(e, expected, 'paused');
      const data = await this.previewData(sql, e, weeks),
        changeId = randomUUID();
      await sql.query(
        'INSERT INTO calendar_changes(id,organisation_id,environment,enrolment_id,enrolment_version,preview,actor_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          changeId,
          client,
          e.environment,
          e.id,
          e.version,
          encrypt(JSON.stringify(data), this.delivery.key),
          actor.id,
          reason,
        ],
      );
      return { id: changeId, version: e.version, preview: data };
    });
  }
  async resume(token: string, csrf: string, client: string, id: string, changeId: string) {
    return this.delivery.locked(token, csrf, client, id, async (sql, actor, e) => {
      await this.onboarding.authorise(sql, actor, e, true);
      const change = (
        await sql.query<CalendarChange>(
          'SELECT * FROM calendar_changes WHERE id=$1 AND enrolment_id=$2 AND organisation_id=$3 AND environment=$4 FOR UPDATE',
          [changeId, id, client, e.environment],
        )
      ).rows[0];
      requireCondition(
        change?.status === 'preview' && change.enrolment_version === e.version,
        409,
        'preview_stale',
        'This preview changed or was used. Make a new preview.',
      );
      const old = JSON.parse(decrypt(change.preview, this.delivery.key)) as Preview,
        data = await this.previewData(sql, e, old.weeks);
      requireCondition(
        isDeepStrictEqual(old, data),
        409,
        'preview_stale',
        'Calendar or content changed. Make a new preview.',
      );
      const blocks = await this.blocks(sql, e);
      requireCondition(
        blocks.length,
        409,
        'blocks_required',
        'The activated learning blocks are unavailable.',
      );
      for (const [blockId, content] of Object.entries(data.replacements)) {
        const block = blocks.find((b) => b.id === blockId)!,
          next = randomUUID();
        await sql.query(
          "UPDATE learning_blocks SET state='superseded',updated_at=now() WHERE id=$1",
          [blockId],
        );
        await sql.query(
          'INSERT INTO learning_blocks(id,organisation_id,environment,enrolment_id,programme_version_id,member_calendar_id,number,version,content,rubric,actor_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
          [
            next,
            client,
            e.environment,
            id,
            block.programme_version_id,
            data.calendar_id,
            block.number,
            block.version + 1,
            encrypt(JSON.stringify(content), this.delivery.key),
            block.rubric,
            actor.id,
            change.reason,
          ],
        );
        const quizzes = (
          await sql.query<{
            lesson_index: number;
            questions: string;
            answer_key: string;
            actor_id: string;
            reason: string;
          }>('SELECT * FROM objective_quizzes WHERE learning_block_id=$1', [blockId])
        ).rows;
        for (const quiz of quizzes)
          await sql.query(
            'INSERT INTO objective_quizzes(id,organisation_id,environment,enrolment_id,learning_block_id,lesson_index,questions,answer_key,actor_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
            [
              randomUUID(),
              client,
              e.environment,
              id,
              next,
              quiz.lesson_index,
              quiz.questions,
              quiz.answer_key,
              actor.id,
              'Preserve reviewed quiz across explicit content or schedule version.',
            ],
          );
      }
      await sql.query(
        'UPDATE capacity_allocations SET active=false WHERE enrolment_id=$1 AND active AND day>=$2::date',
        [id, this.delivery.today(e.timezone)],
      );
      for (const [day, minutes] of Object.entries(data.days))
        await sql.query(
          'INSERT INTO capacity_allocations(id,organisation_id,environment,programme_version_id,enrolment_id,member_id,day,minutes,revision) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [
            randomUUID(),
            client,
            e.environment,
            blocks[0].programme_version_id,
            id,
            e.member_id,
            day,
            minutes,
            e.version,
          ],
        );
      await sql.query(
        "UPDATE adaptation_proposals SET status='stale',updated_at=now() WHERE enrolment_id=$1 AND status IN ('queued','provisional')",
        [id],
      );
      await sql.query(
        "UPDATE calendar_changes SET status='approved',updated_at=now() WHERE id=$1",
        [changeId],
      );
      await sql.query(
        "UPDATE enrolments SET status='active',version=version+1,updated_at=now() WHERE id=$1",
        [id],
      );
      await this.delivery.enrolments.tenancy.audit(
        sql,
        actor,
        client,
        'enrolment.resumed',
        id,
        'Approved calendar preview ' + changeId,
      );
      await this.delivery.notice(sql, e, e.member_id, 'resumed:' + changeId, 'programme_resumed');
      return { version: e.version + 1, status: 'active' };
    });
  }
  async complete(
    token: string,
    csrf: string,
    client: string,
    id: string,
    expected: number,
    reason: string,
  ) {
    return this.delivery.locked(token, csrf, client, id, async (sql, actor, e) => {
      await this.onboarding.authorise(sql, actor, e, true);
      this.delivery.reason(reason);
      this.current(e, expected, 'active');
      const blocks = await this.blocks(sql, e);
      requireCondition(
        blocks.length === e.duration_weeks,
        409,
        'blocks_required',
        'Every required learning block must be present.',
      );
      for (const block of blocks)
        for (const [index] of this.delivery.content(block).lessons.entries())
          requireCondition(
            (
              await sql.query(
                "SELECT id FROM submission_attempts WHERE learning_block_id=$1 AND lesson_index=$2 AND approved_grade_id IS NOT NULL AND status='approved' LIMIT 1",
                [block.id, index],
              )
            ).rowCount,
            409,
            'required_evidence',
            'Every required lesson needs approved evidence.',
          );
      const metrics = (
        await sql.query<KpiVersion>(
          'SELECT DISTINCT ON(number) * FROM kpi_versions WHERE enrolment_id=$1 AND effective_at<=now() ORDER BY number,version DESC',
          [id],
        )
      ).rows;
      requireCondition(
        metrics.length >= 3,
        409,
        'required_metrics',
        'At least three current KPI targets are required.',
      );
      for (const metric of metrics)
        requireCondition(
          (await this.kpis.snapshot(sql, actor, e, metric)).status === 'on_target',
          409,
          'kpi_targets',
          'KPI targets need sufficient approved or verified evidence.',
        );
      await sql.query(
        "UPDATE enrolments SET status='completed',version=version+1,updated_at=now() WHERE id=$1",
        [id],
      );
      await this.kpis.feed(sql, e, id, e.version + 1, 'programme.completed', {
        status: 'completed',
      });
      await this.delivery.enrolments.tenancy.audit(
        sql,
        actor,
        client,
        'enrolment.completed',
        id,
        reason,
      );
      await this.delivery.notice(sql, e, e.member_id, 'completed:' + id, 'programme_completed');
      return { version: e.version + 1, status: 'completed' };
    });
  }
  async read(token: string, client: string, id: string) {
    return this.delivery.db.transaction(async (sql) => {
      const actor = await this.delivery.enrolments.context(sql, token, client),
        e = await this.delivery.enrolments.record(sql, actor, client, id, 'details'),
        manage = (await this.delivery.enrolments.permissions(sql, actor, e)).manage;
      const changes = manage
        ? (
            await sql.query<CalendarChange>(
              "SELECT * FROM calendar_changes WHERE enrolment_id=$1 AND status='preview' ORDER BY created_at DESC,id LIMIT 3",
              [id],
            )
          ).rows
        : [];
      return {
        status: e.status,
        version: e.version,
        canManage: manage,
        previews: changes.map((c) => ({
          id: c.id,
          version: c.enrolment_version,
          reason: c.reason,
          preview: JSON.parse(decrypt(c.preview, this.delivery.key)) as Preview,
          createdAt: c.created_at,
        })),
      };
    });
  }
}
