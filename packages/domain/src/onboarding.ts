import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Enrolments, type Enrolment } from './enrolments.js';
import type { AuthUser } from './auth.js';
import type { Sql } from '../../database/src/database.js';
import { encrypt, decrypt } from './crypto.js';
import { DomainError, requireCondition } from './errors.js';
import { LearningCalendar, type LearningCalendarData } from './learning-calendar.js';
import { onboardingSchema, onboardingSteps, type OnboardingStep } from './onboarding-content.js';
export type OnboardingData = Partial<Record<OnboardingStep, Record<string, unknown>>>;
export type OnboardingVersion = {
  id: string;
  version: number;
  data: string;
  last_step: OnboardingStep;
  created_at: Date;
};
export type MemberCalendar = LearningCalendarData & {
  id: string;
  version: number;
  organisation_id: string;
};
export class Onboarding {
  readonly calendarRules = new LearningCalendar();
  constructor(
    readonly enrolments: Enrolments,
    readonly key: Buffer,
  ) {}
  get auth() {
    return this.enrolments.auth;
  }
  async latest(sql: Sql, e: Enrolment) {
    return (
      await sql.query<OnboardingVersion>(
        'SELECT id,version,data,last_step,created_at FROM onboarding_versions WHERE enrolment_id=$1 AND organisation_id=$2 AND environment=$3 ORDER BY version DESC LIMIT 1',
        [e.id, e.organisation_id, e.environment],
      )
    ).rows[0];
  }
  data(draft?: OnboardingVersion): OnboardingData {
    return draft ? JSON.parse(decrypt(draft.data, this.key)) : {};
  }
  async calendar(sql: Sql, e: Enrolment) {
    return (
      await sql.query<MemberCalendar>(
        'SELECT * FROM member_calendars WHERE member_id=$1 AND environment=$2 ORDER BY version DESC LIMIT 1',
        [e.member_id, e.environment],
      )
    ).rows[0];
  }
  async authorise(sql: Sql, actor: AuthUser, e: Enrolment, coordinator = false) {
    const permissions = await this.enrolments.permissions(sql, actor, e);
    requireCondition(
      permissions.view &&
        (actor.id === e.member_id || permissions.manage) &&
        (!coordinator || permissions.manage),
      403,
      'onboarding_forbidden',
      'This onboarding action is unavailable.',
    );
  }
  async locked<T>(
    token: string,
    csrf: string,
    client: string,
    id: string,
    work: (sql: Sql, actor: AuthUser, e: Enrolment) => Promise<T>,
  ) {
    return this.auth.db.transaction(async (sql) => {
      await sql.query('SELECT id FROM organisations WHERE id=$1 FOR UPDATE', [client]);
      const initialActor = await this.enrolments.context(sql, token, client, csrf);
      const initial = await this.enrolments.record(sql, initialActor, client, id, 'details');
      await sql.query('SELECT id FROM users WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [
        [initialActor.id, initial.member_id],
      ]);
      await sql.query('SELECT id FROM enrolments WHERE id=$1 FOR UPDATE', [id]);
      const actor = await this.enrolments.context(sql, token, client, csrf);
      const e = await this.enrolments.record(sql, actor, client, id, 'details');
      await this.authorise(sql, actor, e);
      requireCondition(
        ['onboarding', 'ready'].includes(e.status),
        409,
        'training_active',
        'Active training requires the calendar-change workflow.',
      );
      return work(sql, actor, e);
    });
  }
  async append(
    sql: Sql,
    actor: AuthUser,
    e: Enrolment,
    step: OnboardingStep,
    data: OnboardingData,
    version: number,
  ) {
    const id = randomUUID();
    await sql.query(
      'INSERT INTO onboarding_versions(id,organisation_id,environment,enrolment_id,version,last_step,data,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        id,
        e.organisation_id,
        e.environment,
        e.id,
        version,
        step,
        encrypt(JSON.stringify(data), this.key),
        actor.id,
      ],
    );
    await this.enrolments.tenancy.audit(
      sql,
      actor,
      e.organisation_id,
      'onboarding.saved',
      id,
      `Saved ${step}; version ${version}`,
    );
    return { id, version };
  }
  async save(
    token: string,
    csrf: string,
    client: string,
    id: string,
    step: OnboardingStep,
    input: unknown,
    expected: number,
    confirm = false,
  ) {
    z.enum(Object.keys(onboardingSteps) as [OnboardingStep, ...OnboardingStep[]]).parse(step);
    z.number().int().min(0).parse(expected);
    return this.locked(token, csrf, client, id, async (sql, actor, e) => {
      if (!['profile', 'assessment', 'schedule'].includes(step) || confirm)
        await this.authorise(sql, actor, e, true);
      requireCondition(
        !confirm || step === 'assessment',
        422,
        'invalid_confirmation',
        'Only assessment findings use this confirmation.',
      );
      const latest = await this.latest(sql, e);
      requireCondition(
        (latest?.version ?? 0) === expected,
        409,
        'onboarding_conflict',
        'This draft changed in another window. Copy your unsaved input before reloading.',
      );
      const validated = onboardingSchema(step, confirm).parse(input) as Record<string, unknown>;
      if (confirm) {
        validated.confirmed_by = actor.id;
        validated.confirmed_at = new Date().toISOString();
      }
      const data = this.data(latest);
      data[step] = validated;
      return this.append(sql, actor, e, step, data, expected + 1);
    });
  }
  complete(draft: OnboardingVersion) {
    const data = this.data(draft);
    for (const step of Object.keys(onboardingSteps) as OnboardingStep[])
      onboardingSchema(step, true).parse(data[step] ?? {});
    requireCondition(
      data.assessment?.confirmed_by,
      422,
      'assessment_unconfirmed',
      'A coordinator must confirm the assessment findings before creating a plan.',
    );
    return data;
  }
  async confirmCalendar(
    token: string,
    csrf: string,
    client: string,
    id: string,
    expected: number,
    expectedOnboarding: number,
    reason: string,
  ) {
    z.number().int().min(0).parse(expected);
    z.number().int().positive().parse(expectedOnboarding);
    z.string().trim().min(8).max(2000).parse(reason);
    return this.locked(token, csrf, client, id, async (sql, actor, e) => {
      await this.authorise(sql, actor, e, true);
      const draft = await this.latest(sql, e);
      requireCondition(
        draft && draft.version === expectedOnboarding,
        409,
        'onboarding_conflict',
        'Onboarding changed; review the latest availability.',
      );
      const old = await this.calendar(sql, e);
      requireCondition(
        (old?.version ?? 0) === expected,
        409,
        'calendar_conflict',
        'The shared calendar changed. Review the current calendar.',
      );
      const data = onboardingSchema('schedule', true).parse(
        this.data(draft).schedule ?? {},
      ) as Record<string, unknown>;
      const calendar: MemberCalendar = {
        id: randomUUID(),
        organisation_id: client,
        member_id: e.member_id,
        environment: e.environment,
        version: expected + 1,
        timezone: data.timezone as string,
        daily_minutes: data.capacity_minutes as number,
        business_weekdays: old?.business_weekdays ?? [1, 2, 3, 4, 5],
        weekdays: data.weekdays as number[],
        holidays: (data.holidays ?? []) as string[],
        absences: (data.absences ?? []) as string[],
      };
      const reserved = await sql.query<{ day: string }>(
        "SELECT DISTINCT to_char(day,'YYYY-MM-DD') AS day FROM capacity_allocations WHERE member_id=$1 AND environment=$2 AND active",
        [e.member_id, e.environment],
      );
      requireCondition(
        !reserved.rowCount || old?.timezone === calendar.timezone,
        422,
        'calendar_timezone_conflict',
        'A timezone change with approved reservations requires an explicit reschedule first.',
      );
      await this.calendarRules.assertCapacity(
        sql,
        calendar,
        Object.fromEntries(reserved.rows.map((r) => [r.day, 0])),
      );
      await sql.query(
        'INSERT INTO member_calendars(id,organisation_id,environment,member_id,version,timezone,daily_minutes,business_weekdays,weekdays,holidays,absences,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
        [
          calendar.id,
          client,
          e.environment,
          e.member_id,
          calendar.version,
          calendar.timezone,
          calendar.daily_minutes,
          JSON.stringify(calendar.business_weekdays),
          JSON.stringify(calendar.weekdays),
          JSON.stringify(calendar.holidays),
          JSON.stringify(calendar.absences),
          reason,
          actor.id,
        ],
      );
      await this.enrolments.tenancy.audit(
        sql,
        actor,
        client,
        'calendar.confirmed',
        calendar.id,
        reason,
      );
      return { id: calendar.id, version: calendar.version };
    });
  }
  async read(token: string, client: string, id: string) {
    return this.auth.db.transaction(async (sql) => {
      const actor = await this.enrolments.context(sql, token, client);
      const e = await this.enrolments.record(sql, actor, client, id, 'details');
      await this.authorise(sql, actor, e);
      const draft = await this.latest(sql, e),
        calendar = await this.calendar(sql, e);
      const plan =
        (
          await sql.query<{ id: string; version: number; state: string }>(
            'SELECT id,version,state FROM programme_versions WHERE enrolment_id=$1 AND organisation_id=$2 AND environment=$3 ORDER BY version DESC LIMIT 1',
            [id, client, e.environment],
          )
        ).rows[0] ?? null;
      let preview: { days: number; minutes: number } | null = null;
      const schedule = this.data(draft).schedule;
      if (calendar && schedule?.duration && schedule?.start_date && schedule?.daily_minutes) {
        try {
          const blocks = this.calendarRules.blocks(
            calendar,
            String(schedule.start_date),
            Number(schedule.duration),
          );
          const days = blocks.reduce((n, b) => n + b.days.length, 0);
          preview = { days, minutes: days * Number(schedule.daily_minutes) };
        } catch (error) {
          if (!(error instanceof DomainError)) throw error;
        }
      }
      const member = (
        await sql.query<{ name: string }>('SELECT name FROM users WHERE id=$1 AND environment=$2', [
          e.member_id,
          e.environment,
        ])
      ).rows[0];
      // Shared availability is required for capacity planning. Cross-client actor/reason/org
      // metadata and programme identities are never included in this projection.
      return {
        enrolment: { id: e.id, title: e.title, status: e.status, memberName: member.name },
        lastStep: draft?.last_step ?? 'profile',
        plan,
        preview,
        canManage: (await this.enrolments.permissions(sql, actor, e)).manage,
        version: draft?.version ?? 0,
        data: this.data(draft),
        calendar: calendar
          ? {
              id: calendar.id,
              version: calendar.version,
              timezone: calendar.timezone,
              daily_minutes: calendar.daily_minutes,
              business_weekdays: calendar.business_weekdays,
              weekdays: calendar.weekdays,
              holidays: calendar.holidays,
              absences: calendar.absences,
            }
          : null,
      };
    });
  }
}
